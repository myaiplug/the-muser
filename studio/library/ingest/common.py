"""Shared helpers for the sound-library ingesters (audio processing + record building)."""
import hashlib, json, math, os, re
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

SR = 44100
LIB = Path(__file__).resolve().parent.parent
TAXONOMY = json.loads((LIB / "taxonomy" / "taxonomy.json").read_text())
CATS = {c["id"]: c for c in TAXONOMY["categories"]}


def slug(s: str) -> str:
    return re.sub(r"-+", "-", re.sub(r"[^a-z0-9]+", "-", s.lower())).strip("-")


def to_mono(x: np.ndarray) -> np.ndarray:
    x = np.asarray(x, dtype=np.float64)
    return x if x.ndim == 1 else x.mean(axis=1)


def resample(x: np.ndarray, sr: int) -> np.ndarray:
    if sr == SR:
        return x
    g = math.gcd(SR, sr)
    return signal.resample_poly(x, SR // g, sr // g)


def finish(x: np.ndarray, max_s: float = 2.5, thresh_db: float = -60.0, peak_db: float = -1.0,
           lead_ms: float = 2.0) -> np.ndarray:
    """Trim leading silence, cut the tail when it falls under thresh, fade out, peak-normalise."""
    x = np.asarray(x, dtype=np.float64)
    pk = float(np.max(np.abs(x))) or 1.0
    thr = pk * 10 ** (thresh_db / 20)
    idx = np.nonzero(np.abs(x) > pk * 10 ** (-40 / 20))[0]
    start = max(0, (idx[0] if len(idx) else 0) - int(SR * lead_ms / 1000))
    x = x[start:]
    # tail: last sample above thresh (smoothed with a short window)
    env = np.convolve(np.abs(x), np.ones(256) / 256, mode="same")
    above = np.nonzero(env > thr)[0]
    end = (above[-1] + 1) if len(above) else len(x)
    end = min(end + int(SR * 0.02), len(x), int(SR * max_s))
    x = x[:end].copy()
    fade = min(int(SR * 0.02), len(x) // 2)
    if fade > 0:
        x[-fade:] *= np.linspace(1, 0, fade) ** 2
    x -= x.mean()
    pk = float(np.max(np.abs(x))) or 1.0
    return x * (10 ** (peak_db / 20) / pk)


def write_flac(x: np.ndarray, path: Path) -> dict:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), np.clip(x, -1, 1), SR, format="FLAC", subtype="PCM_16")
    data = path.read_bytes()
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "bytes": len(data),
        "duration_ms": int(round(len(x) / SR * 1000)),
        "sample_rate": SR,
    }


def make_record(*, sid, title, category, source, license, license_url, author, source_url,
                provenance, file, audio_info, extra_tags=(), attribution_text=None,
                processing="mono, trimmed, faded, peak-normalised to -1 dBFS, FLAC 16-bit 44.1 kHz",
                origin_path=None, notes=None):
    cat = CATS[category]
    tags = []
    for t in [cat["type"], *cat["tags"], *extra_tags]:
        t = slug(t)
        if t and t not in tags:
            tags.append(t)
    if attribution_text is None:
        lic_name = {"CC0-1.0": "CC0 1.0 Universal", "CC-BY-4.0": "CC BY 4.0", "CC-BY-3.0": "CC BY 3.0"}[license]
        attribution_text = f'"{title}" by {author}, {source_url}, licensed {lic_name} ({license_url}).'
    rec = {
        "id": sid, "title": title, "type": cat["type"], "category": category,
        "tags": tags, "genres": list(cat["genres"]),
        "license": license, "license_url": license_url, "author": author,
        "source": source, "source_url": source_url, "provenance": provenance,
        "attribution_text": attribution_text, "processing": processing,
        "file": file, **audio_info,
    }
    if origin_path:
        rec["origin_path"] = origin_path
    if notes:
        rec["notes"] = notes
    return rec


def save_records(name: str, records: list):
    p = LIB / "data" / "records" / f"{name}.json"
    p.parent.mkdir(parents=True, exist_ok=True)
    records = sorted(records, key=lambda r: r["id"])
    p.write_text(json.dumps(records, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {len(records)} records -> {p}")
