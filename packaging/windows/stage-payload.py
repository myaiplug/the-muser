#!/usr/bin/env python3
"""Copy the files the Windows full installer needs into dist/installer-payload."""
from __future__ import annotations

import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DEST = ROOT / "dist" / "installer-payload"

IGNORE = shutil.ignore_patterns(
    "__pycache__",
    "*.pyc",
    "*.pyo",
    ".venv",
    "node_modules",
    "library",
    ".git",
    ".pytest_cache",
    "*.egg-info",
    ".turbo",
    ".DS_Store",
)

TOP_FILES = [
    "pyproject.toml",
    "LICENSE",
    "NOTICE",
    "THIRD_PARTY_LICENSES.md",
    "README.md",
    "STUDIO_README.md",
    ".env.example",
    "start_studio.bat",
    "start_studio.ps1",
    "setup_windows.bat",
    "setup_windows.ps1",
]


def main() -> int:
    if DEST.exists():
        shutil.rmtree(DEST)
    DEST.mkdir(parents=True)

    for name in TOP_FILES:
        src = ROOT / name
        if src.exists():
            shutil.copy2(src, DEST / name)

    for folder in ("src", "studio", "docs", "scripts"):
        src = ROOT / folder
        if src.is_dir():
            shutil.copytree(src, DEST / folder, ignore=IGNORE)

    win = DEST / "packaging" / "windows"
    win.mkdir(parents=True, exist_ok=True)
    shutil.copy2(ROOT / "packaging" / "windows" / "post-install.ps1", win / "post-install.ps1")
    shutil.copy2(ROOT / "packaging" / "windows" / "TheMuser.cmd", DEST / "TheMuser.cmd")
    icon = ROOT / "packaging" / "icon.ico"
    if icon.exists():
        shutil.copy2(icon, DEST / "packaging" / "icon.ico")

    dist_index = DEST / "studio" / "web" / "dist" / "index.html"
    if not dist_index.exists():
        print("studio/web/dist is missing. Build it first: cd studio/web && npm ci && npm run build", file=sys.stderr)
        return 1
    print(f"Staged installer payload at {DEST}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
