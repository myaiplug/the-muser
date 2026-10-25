"""Auto-selector: pick the best installed engine for a job on this machine."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from . import hardware, registry
from .errors import FriendlyError

COMMERCIAL_RANK = {"yes": 2, "conditional": 1, "no": 0}


@dataclass
class Choice:
    task: str
    engine: str
    name: str
    reasons: list[str]
    alternatives: list[dict[str, Any]] = field(default_factory=list)
    upgrades: list[dict[str, Any]] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return self.__dict__.copy()


def fits(spec: registry.EngineSpec, hw: hardware.Hardware) -> tuple[bool, str]:
    if spec.min_vram_gb <= 0:
        return True, "runs on CPU"
    if hw.vram_gb >= spec.min_vram_gb:
        return True, f"fits your {hw.vram_gb:g} GB GPU"
    if spec.cpu_ok:
        return True, "runs on CPU (slow without a GPU)"
    return False, f"needs {spec.min_vram_gb:g} GB of GPU memory (you have {hw.vram_gb:g} GB)"


def allowed(spec: registry.EngineSpec, commercial_only: bool, allow_conditional: bool = True) -> bool:
    if not commercial_only:
        return True
    if spec.commercial == "no":
        return False
    if spec.commercial == "conditional" and not allow_conditional:
        return False
    return True


def score(spec: registry.EngineSpec, task: str, hw: hardware.Hardware) -> float:
    s = float(spec.quality.get(task, 0)) * 10
    s += COMMERCIAL_RANK[spec.commercial]  # tie-break toward the safest licence
    if spec.verified == "working":
        s += 3  # prefer engines proven on this codebase when quality is close
    if spec.min_vram_gb > 0 and not hw.has_gpu:
        s -= 25  # CPU fallback of a GPU model is painfully slow
    return s


def candidates(task: str, hw: hardware.Hardware | None = None, commercial_only: bool = True,
               allow_conditional: bool = True, health_fn=None) -> list[dict[str, Any]]:
    hw = hw or hardware.detect()
    health_fn = health_fn or registry.health
    out = []
    for spec in registry.ENGINES:
        if task not in spec.tasks:
            continue
        ok, why = fits(spec, hw)
        h = health_fn(spec)
        out.append({
            "key": spec.key, "name": spec.name, "score": score(spec, task, hw), "fits": ok, "fit_reason": why,
            "installed": h["installed"], "healthy": h["healthy"], "detail": h["detail"],
            "allowed": allowed(spec, commercial_only, allow_conditional), "commercial": spec.commercial,
            "verified": spec.verified,
        })
    out.sort(key=lambda c: -c["score"])
    return out


def select(task: str, hw: hardware.Hardware | None = None, commercial_only: bool = True,
           allow_conditional: bool = True, prefer: str | None = None, health_fn=None) -> Choice:
    """Return the best usable engine. ``prefer`` forces a key if it is usable."""
    if task not in registry.TASKS:
        raise FriendlyError(f"Unknown job type '{task}'.")
    hw = hw or hardware.detect()
    cands = candidates(task, hw, commercial_only, allow_conditional, health_fn)
    usable = [c for c in cands if c["fits"] and c["healthy"] and c["allowed"]]
    if prefer and prefer != "auto":
        forced = next((c for c in cands if c["key"] == prefer), None)
        if forced is None:
            raise FriendlyError(f"'{prefer}' can't do that job.")
        if not forced["healthy"]:
            raise FriendlyError(f"{forced['name']} is not installed yet.", "Open System and press Install.")
        if not forced["fits"]:
            raise FriendlyError(f"{forced['name']} {forced['fit_reason']}.")
        usable = [forced] + [c for c in usable if c is not forced]
    if not usable:
        raise FriendlyError("No engine for this job is installed yet.", "Open System and press Install on one of the suggested tools.")
    best = usable[0]
    spec = registry.get(best["key"])
    reasons = [f"Best quality installed for '{registry.TASKS[task]}'" if not prefer or prefer == "auto" else "You picked this engine",
               best["fit_reason"][:1].upper() + best["fit_reason"][1:],
               {"yes": "Commercial-safe output", "conditional": "Commercial use has conditions: " + spec.commercial_note,
                "no": "Non-commercial licence: personal use only"}[spec.commercial]]
    if spec.verified != "working":
        reasons.append("Adapter untested here: report issues if it fails")
    upgrades = [
        {"key": c["key"], "name": c["name"], "detail": c["fit_reason"]}
        for c in cands
        if c["score"] > best["score"] and c["fits"] and c["allowed"] and not c["installed"]
    ]
    return Choice(task, best["key"], best["name"], reasons,
                  alternatives=[{"key": c["key"], "name": c["name"]} for c in usable[1:]], upgrades=upgrades)


def recommendations(hw: hardware.Hardware | None = None) -> list[dict[str, Any]]:
    """Which heavy models this PC can run (used by setup and the System panel)."""
    hw = hw or hardware.detect()
    rec = []
    for spec in registry.ENGINES:
        if spec.tier != "heavy":
            continue
        ok, why = fits(spec, hw)
        if ok and spec.min_vram_gb > 0 and not hw.has_gpu:
            ok, why = False, "needs an NVIDIA GPU to be usable"
        rec.append({"key": spec.key, "name": spec.name, "tasks": spec.tasks, "can_run": ok, "reason": why,
                    "commercial": spec.commercial, "min_vram_gb": spec.min_vram_gb, "windows": spec.windows})
    rec.sort(key=lambda r: (not r["can_run"], -COMMERCIAL_RANK[r["commercial"]], r["min_vram_gb"]))
    return rec
