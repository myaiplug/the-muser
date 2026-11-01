"""Pick ACE-Step v1.5 memory settings that fit the local GPU.

The upstream ACE-Step 1.5 GPU tiers (docs/en/GPU_COMPATIBILITY.md) say:

* 6-8 GB  : 2B turbo DiT, 0.6B LM on the ``pt`` backend, CPU offload + INT8.
* 8-12 GB : 2B turbo DiT + 0.6B LM, offload VAE / text encoder, INT8.
* 12-16 GB: 2B turbo/sft + 1.7B LM, DiT stays on the GPU.
* 20 GB+  : no offload, no quantization (the original Muser default).

Env vars always win: MUSER_ACESTEP_DIT_MODEL, MUSER_ACESTEP_LM_MODEL,
MUSER_ACESTEP_OFFLOAD (true/false), MUSER_ACESTEP_OFFLOAD_DIT (true/false),
MUSER_ACESTEP_QUANT (int8_weight_only, fp8_weight_only, none) and
MUSER_ACESTEP_VRAM_BUDGET (GB checked before loading).

On top of the per-card ACE-Step tiers there is a coarse Muser *hardware
profile* (``MUSER_HARDWARE_PROFILE`` = ``auto`` | ``8gb`` | ``24gb``) that
picks the defaults in ``src/orchestrator/config.py`` (VRAM budgets, Ollama
model, ACE-Step DiT/LM).  ``auto`` detects VRAM without importing torch.
"""

from __future__ import annotations

import os
import shutil
import subprocess
from dataclasses import asdict, dataclass


@dataclass
class AceStepProfile:
    tier: str
    dit_model: str
    lm_model: str
    lm_backend: str
    offload_to_cpu: bool
    offload_dit_to_cpu: bool
    quantization: str | None
    budget_gb: float
    max_duration_s: int
    note: str

    def to_dict(self) -> dict:
        return asdict(self)


def _flag(name: str, default: bool) -> bool:
    v = os.environ.get(name)
    if v is None or v.strip() == "":
        return default
    return v.strip().lower() in ("1", "true", "yes", "on")


def acestep_profile(total_vram_gb: float) -> AceStepProfile:
    if total_vram_gb <= 0:
        p = AceStepProfile(
            "cpu",
            "acestep-v15-turbo",
            "",
            "pt",
            True,
            True,
            None,
            0.0,
            120,
            "No NVIDIA GPU: very slow CPU mode, the Studio uses the sketch synth instead.",
        )
    elif total_vram_gb < 8.5:
        # 8 GB cards (RTX 2070/2080/3060 Ti/4060) report 7.6-8.0 GB.
        p = AceStepProfile(
            "8gb",
            "acestep-v15-turbo",
            "acestep-5Hz-lm-0.6B",
            "pt",
            True,
            True,
            "int8_weight_only",
            3.5,
            480,
            "8 GB profile: 2B turbo DiT, 0.6B LM (pt backend), CPU offload, INT8 weights.",
        )
    elif total_vram_gb < 12:
        p = AceStepProfile(
            "8-12gb",
            "acestep-v15-turbo",
            "acestep-5Hz-lm-0.6B",
            "pt",
            True,
            False,
            "int8_weight_only",
            6.0,
            480,
            "8-12 GB profile: DiT on GPU, VAE and text encoder offloaded, INT8 weights.",
        )
    elif total_vram_gb < 20:
        p = AceStepProfile(
            "12-20gb",
            "acestep-v15-turbo",
            "acestep-5Hz-lm-1.7B",
            "pt",
            False,
            False,
            "int8_weight_only",
            9.0,
            480,
            "12-20 GB profile: 1.7B LM, no offload.",
        )
    else:
        p = AceStepProfile(
            "20gb+",
            "acestep-v15-sft",
            "acestep-5Hz-lm-1.7B",
            "pt",
            False,
            False,
            None,
            22.0,
            600,
            "Full quality profile (original Muser default).",
        )
    env = os.environ
    p.dit_model = env.get("MUSER_ACESTEP_DIT_MODEL") or p.dit_model
    p.lm_model = env.get("MUSER_ACESTEP_LM_MODEL") or p.lm_model
    p.offload_to_cpu = _flag("MUSER_ACESTEP_OFFLOAD", p.offload_to_cpu)
    p.offload_dit_to_cpu = _flag("MUSER_ACESTEP_OFFLOAD_DIT", p.offload_dit_to_cpu)
    q = env.get("MUSER_ACESTEP_QUANT")
    if q is not None:
        p.quantization = None if q.strip().lower() in ("", "none", "off", "false") else q.strip()
    if env.get("MUSER_ACESTEP_VRAM_BUDGET"):
        p.budget_gb = float(env["MUSER_ACESTEP_VRAM_BUDGET"])
    return p


def cuda_total_vram_gb() -> float:
    try:
        import torch

        if torch.cuda.is_available():
            return torch.cuda.get_device_properties(0).total_memory / 2**30
    except Exception:
        pass
    return 0.0


# ---------------------------------------------------------------------------
# Muser hardware profile (8gb / 24gb)
# ---------------------------------------------------------------------------

HARDWARE_PROFILES = ("8gb", "24gb")

# Cards below this much VRAM get the low-VRAM ("8gb") profile under ``auto``.
LOW_VRAM_THRESHOLD_GB = 20.0


def _float_env(name: str) -> float | None:
    v = os.environ.get(name)
    if v is None or v.strip() == "":
        return None
    try:
        return float(v)
    except ValueError:
        return None


def nvidia_smi_total_vram_gb(timeout: float = 5.0) -> float:
    """Total VRAM of GPU 0 from ``nvidia-smi`` (0.0 if unavailable).

    Used at config import time, so it must stay cheap and never import torch.
    """
    exe = shutil.which("nvidia-smi")
    if not exe:
        return 0.0
    try:
        out = subprocess.run(
            [exe, "--query-gpu=memory.total", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
        if out.returncode != 0:
            return 0.0
        first = out.stdout.strip().splitlines()[0]
        return float(first.strip()) / 1024.0  # MiB -> GiB
    except (OSError, subprocess.SubprocessError, ValueError, IndexError):
        return 0.0


def detect_total_vram_gb() -> float:
    """Best-effort total VRAM in GB without importing torch.

    Order: ``MUSER_VRAM_GB`` (explicit), ``MUSER_FORCE_VRAM_GB`` (the Studio's
    preview override), then ``nvidia-smi``.  Returns 0.0 if nothing is found.
    """
    for name in ("MUSER_VRAM_GB", "MUSER_FORCE_VRAM_GB"):
        v = _float_env(name)
        if v is not None:
            return v
    return nvidia_smi_total_vram_gb()


def resolve_hardware_profile(value: str | None = None, vram_gb: float | None = None) -> str:
    """Return ``"8gb"`` or ``"24gb"``.

    *value* defaults to ``MUSER_HARDWARE_PROFILE`` (``auto`` when unset).
    Under ``auto`` a detected card below 20 GB picks ``"8gb"``; 20 GB and up,
    or no detectable NVIDIA GPU, keeps the original ``"24gb"`` behavior.
    """
    if value is None:
        value = os.environ.get("MUSER_HARDWARE_PROFILE", "auto")
    v = (value or "auto").strip().lower().replace(" ", "")
    if v in ("8", "8g", "8gb", "low", "lowvram"):
        return "8gb"
    if v in ("24", "24g", "24gb", "high", "full"):
        return "24gb"
    gb = detect_total_vram_gb() if vram_gb is None else vram_gb
    if 0 < gb < LOW_VRAM_THRESHOLD_GB:
        return "8gb"
    return "24gb"


def acestep_profile_for(hardware_profile: str | None, total_vram_gb: float) -> AceStepProfile:
    """ACE-Step tier honoring an explicitly chosen hardware profile.

    With ``MUSER_HARDWARE_PROFILE=auto`` (or unset) the tier follows the real
    card, exactly like :func:`acestep_profile`.  An explicit ``8gb`` caps the
    tier at the 8 GB settings; an explicit ``24gb`` forces the full-quality
    tier (the original Muser path) even on a smaller card.
    """
    explicit = os.environ.get("MUSER_HARDWARE_PROFILE", "auto").strip().lower()
    if explicit in ("", "auto") or hardware_profile is None:
        return acestep_profile(total_vram_gb)
    if hardware_profile == "8gb":
        return acestep_profile(min(total_vram_gb, 7.8) if total_vram_gb > 0 else 7.8)
    return acestep_profile(max(total_vram_gb, 24.0))
