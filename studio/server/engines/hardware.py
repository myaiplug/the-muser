"""Hardware detection used by the auto-selector and the setup recommendations."""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import time
from dataclasses import asdict, dataclass, field

_CACHE: tuple[float, "Hardware"] | None = None


@dataclass
class Hardware:
    os: str
    cpu_count: int
    ram_gb: float
    gpu: str = ""
    vram_gb: float = 0.0
    cuda: bool = False
    source: str = "none"  # nvidia-smi | torch | env | none
    notes: list[str] = field(default_factory=list)

    @property
    def has_gpu(self) -> bool:
        return self.vram_gb > 0

    def tier(self) -> str:
        if self.vram_gb >= 20:
            return "studio-gpu"
        if self.vram_gb >= 10:
            return "gpu"
        if self.vram_gb >= 6:
            return "entry-gpu"
        if self.vram_gb > 0:
            return "small-gpu"
        return "cpu"

    def to_dict(self) -> dict:
        d = asdict(self)
        d["tier"] = self.tier()
        d["has_gpu"] = self.has_gpu
        return d


def _ram_gb() -> float:
    try:
        import psutil  # type: ignore

        return round(psutil.virtual_memory().total / 2**30, 1)
    except Exception:
        pass
    try:
        with open("/proc/meminfo") as f:
            for line in f:
                if line.startswith("MemTotal"):
                    return round(int(line.split()[1]) / 2**20, 1)
    except Exception:
        pass
    if platform.system() == "Windows":
        try:
            import ctypes

            class MS(ctypes.Structure):
                _fields_ = [("dwLength", ctypes.c_ulong), ("dwMemoryLoad", ctypes.c_ulong), ("ullTotalPhys", ctypes.c_ulonglong)] + [
                    (n, ctypes.c_ulonglong) for n in ("a", "b", "c", "d", "e", "f")
                ]

            m = MS()
            m.dwLength = ctypes.sizeof(MS)
            ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(m))  # type: ignore[attr-defined]
            return round(m.ullTotalPhys / 2**30, 1)
        except Exception:
            pass
    return 0.0


def detect(force: bool = False) -> Hardware:
    global _CACHE
    if _CACHE and not force and time.time() - _CACHE[0] < 60:
        return _CACHE[1]
    hw = Hardware(os=platform.system() or "unknown", cpu_count=os.cpu_count() or 1, ram_gb=_ram_gb())
    forced = os.environ.get("MUSER_FORCE_VRAM_GB")
    if forced is not None:
        hw.vram_gb = float(forced)
        hw.gpu = "forced via MUSER_FORCE_VRAM_GB" if hw.vram_gb else ""
        hw.cuda = hw.vram_gb > 0
        hw.source = "env"
    elif shutil.which("nvidia-smi"):
        try:
            out = subprocess.run(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                capture_output=True,
                text=True,
                timeout=8,
            ).stdout.strip()
            if out:
                best = max((line.split(",") for line in out.splitlines()), key=lambda p: float(p[1]))
                hw.gpu, hw.vram_gb, hw.cuda, hw.source = best[0].strip(), round(float(best[1]) / 1024, 1), True, "nvidia-smi"
        except Exception as e:  # pragma: no cover
            hw.notes.append(f"nvidia-smi failed: {e}")
    if hw.source == "none":
        try:
            import importlib.util

            if importlib.util.find_spec("torch") is not None:
                import torch

                if torch.cuda.is_available():
                    p = torch.cuda.get_device_properties(0)
                    hw.gpu, hw.vram_gb, hw.cuda, hw.source = p.name, round(p.total_memory / 2**30, 1), True, "torch"
        except Exception:
            pass
    if not hw.has_gpu:
        hw.notes.append("No NVIDIA GPU found: heavy AI models are skipped and CPU-friendly engines are used.")
    _CACHE = (time.time(), hw)
    return hw
