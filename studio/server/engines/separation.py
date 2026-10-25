"""Stem separation engines: audio-separator (UVR models), Demucs, band split."""

from __future__ import annotations

import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

from .errors import FriendlyError

try:
    from src.orchestrator.config import MODELS_DIR
except Exception:  # pragma: no cover
    MODELS_DIR = Path(__file__).resolve().parents[3] / "models"

SEP_MODEL_DIR = Path(MODELS_DIR) / "audio-separator"
DEFAULT_MODEL = "UVR-MDX-NET-Inst_HQ_3.onnx"

# Curated choices shown in Advanced mode. "stems" says what you get back.
MODELS: list[dict[str, Any]] = [
    {
        "file": "UVR-MDX-NET-Inst_HQ_3.onnx",
        "label": "MDX-Net Inst HQ3 (fast, CPU friendly)",
        "stems": 2,
        "gpu": False,
        "default_for": "2stem",
    },
    {"file": "Kim_Vocal_2.onnx", "label": "Kim Vocal 2 (clean vocals)", "stems": 2, "gpu": False},
    {
        "file": "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
        "label": "BS-Roformer (best vocals, GPU recommended)",
        "stems": 2,
        "gpu": True,
    },
    {
        "file": "htdemucs.yaml",
        "label": "Demucs v4 (4 stems)",
        "stems": 4,
        "gpu": False,
        "default_for": "4stem",
    },
    {
        "file": "htdemucs_ft.yaml",
        "label": "Demucs v4 fine-tuned (4 stems, slower, better)",
        "stems": 4,
        "gpu": True,
    },
    {
        "file": "htdemucs_6s.yaml",
        "label": "Demucs v4 6 stems (adds guitar and piano)",
        "stems": 6,
        "gpu": True,
    },
]


def default_model(mode: str) -> str:
    for m in MODELS:
        if m.get("default_for") == mode:
            return m["file"]
    return DEFAULT_MODEL


def _separator(out_dir: Path):
    from audio_separator.separator import Separator  # type: ignore

    SEP_MODEL_DIR.mkdir(parents=True, exist_ok=True)
    return Separator(output_dir=str(out_dir), model_file_dir=str(SEP_MODEL_DIR), log_level=40)


def prefetch(model: str = DEFAULT_MODEL) -> None:
    sep = _separator(SEP_MODEL_DIR)
    sep.load_model(model_filename=model)


def _stem_name(fname: str) -> str:
    m = re.search(r"_\(([^)]+)\)", fname)
    name = (m.group(1) if m else Path(fname).stem).lower()
    return {"instrumental": "instrumental", "no vocals": "instrumental"}.get(name, name)


def run_audio_separator(
    path: str, out_dir: Path, model: str, progress: Callable[[str], None] | None = None
) -> dict[str, str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    sep = _separator(out_dir)
    if progress:
        progress(f"Loading {model} (first use downloads it) ...")
    sep.load_model(model_filename=model)
    if progress:
        progress("Separating ...")
    files = sep.separate(path)
    stems: dict[str, str] = {}
    for f in files:
        p = Path(f)
        if not p.is_absolute():
            p = out_dir / p
        stems[_stem_name(p.name)] = str(p.resolve())
    if not stems:
        raise FriendlyError("The splitter finished but produced no stems.")
    return stems


def separate(
    path: str,
    out_dir: Path,
    mode: str = "4stem",
    engine: str = "auto",
    model: str | None = None,
    progress: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Split ``path``. Returns {stems: {name: path}, engine, model, note}."""
    from . import selector

    if engine == "auto":
        engine = selector.select("separate").engine
    if engine == "audio-separator":
        model = model or default_model(mode)
        stems = run_audio_separator(path, out_dir, model, progress)
        return {
            "stems": stems,
            "engine": engine,
            "model": model,
            "note": f"Separated with audio-separator ({model}).",
        }
    if engine == "demucs":
        from src.voice.demucs_wrapper import separate_stems

        stems = separate_stems(
            path, output_dir=str(out_dir), two_stems=(mode == "2stem"), model=model or "htdemucs"
        )
        if not stems:
            raise FriendlyError("Demucs produced no stems.")
        return {
            "stems": stems,
            "engine": engine,
            "model": model or "htdemucs",
            "note": "Separated with Demucs.",
        }
    if engine == "band-split":
        from .. import demo_synth

        stems = demo_synth.band_split(path, out_dir)
        return {
            "stems": stems,
            "engine": engine,
            "model": "crossover",
            "note": "Frequency-band split (crossover), not true source separation. Install Audio Separator for real stems.",
        }
    raise FriendlyError(f"'{engine}' can't split stems.")


def vocals_and_instrumental(stems: dict[str, str]) -> tuple[str | None, list[str]]:
    """Find the vocal stem and the rest."""
    voc = next(
        (p for n, p in stems.items() if "vocal" in n and "no" not in n and "instrument" not in n),
        None,
    )
    rest = [p for p in stems.values() if p != voc]
    return voc, rest
