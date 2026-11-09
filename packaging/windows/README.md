# Windows desktop build and installer

The recommended Windows installer (`muser.iss`) is a full Setup.exe. It copies The Muser, a pre-built Studio UI, Start Menu and optional desktop shortcuts, and an uninstaller. On first install it creates a real Python environment so **Engines → Install works** (ACE-Step and other models download onto your PC). User data stays in `%LOCALAPPDATA%\TheMuser`, so uninstalling does not delete tracks or downloaded models.

The older frozen PyInstaller app (`muser-frozen.iss`, output `TheMuser.exe`) cannot `pip install` extra engines after the fact. Prefer `muser.iss`.

`nodaw-studio.iss` is an older starter script that copied the web `dist` folder plus a `.bat` launcher.

## What you need to *build* the installer

- Windows 10/11 x64 (or GitHub Actions `windows-latest`)
- Node.js 20+
- Python 3.10+
- [Inno Setup 6](https://jrsoftware.org/isdl.php) (`ISCC.exe` on your PATH)

The person *running* Setup.exe does not need Node. The installer will install Python 3.11, Git, and ffmpeg if they are missing (via winget when possible).

## Build

From the repo root:

```powershell
.\packaging\windows\build-installer.ps1
```

That builds `studio/web`, stages `dist/installer-payload`, then compiles `packaging/windows/muser.iss`.

Output:

- Payload: `dist/installer-payload/`
- Installer: `dist/installer/TheMuser-Setup-1.1.0-win64.exe`

You can also compile the installer yourself after staging:

```powershell
python packaging\windows\stage-payload.py
iscc /DAppVersion=1.1.0 packaging\windows\muser.iss
```

Optional CI: add `.github/workflows/desktop-installers.yml` (see that file in this repo when present) on a machine whose GitHub token has the `workflow` scope, then dispatch it or push a `v*` tag.

## After install

1. Open **The Muser** from the Start menu. A console window starts the local server and your browser opens `http://127.0.0.1:8765`.
2. Open **Engines**, find a model marked **Fits**, press **Install**. On an 8 GB NVIDIA card start with **ACE-Step 1.5**.
3. Tick **NVIDIA GPU support** in the installer if you have an NVIDIA card (installs CUDA PyTorch). You can also run `setup_windows.bat -Gpu` later.

## MIDI and the sample library

- MIDI learn works in the desktop window the same as in the browser (Web MIDI).
- Scan folders from the Sample Library pane. Indexed files are served only through `/api/library/file` (path must already be in the library database).
- Pad kits still persist in IndexedDB inside the browser the Studio opens, with an Autosave kit written whenever you load a sample onto a pad.
