# First-run setup for the full Windows installer.
# Installs Python 3.11 / Git / ffmpeg if they are missing, then runs setup_windows.ps1
# so Engines -> Install works (real venv, not a frozen exe).
param(
  [Parameter(Mandatory = $true)][string]$AppDir,
  [switch]$Gpu
)

$ErrorActionPreference = "Continue"

function Say($msg, $color = "Gray") { Write-Host $msg -ForegroundColor $color }

function Refresh-Path {
  $machine = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $user = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = @($machine, $user) -join ";"
}

function Has($cmd) { return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Test-Python {
  if (Has "py") {
    foreach ($v in @("3.11", "3.12", "3.10")) {
      & py "-$v" -c "import sys" 2>$null
      if ($LASTEXITCODE -eq 0) { return $true }
    }
  }
  if (Has "python") {
    $ver = & python -c "import sys; print('%d.%d' % sys.version_info[:2])" 2>$null
    if ($ver -in @("3.10", "3.11", "3.12")) { return $true }
  }
  return $false
}

function Install-Python {
  if (Has "winget") {
    Say "Installing Python 3.11..." "Cyan"
    winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (Test-Python) { return }
  }
  Say "Downloading Python 3.11..." "Cyan"
  $url = "https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe"
  $out = Join-Path $env:TEMP "python-3.11.9-amd64.exe"
  Invoke-WebRequest -Uri $url -OutFile $out
  Start-Process -Wait -FilePath $out -ArgumentList "/quiet", "InstallAllUsers=0", "PrependPath=1", "Include_launcher=1", "Include_test=0", "SimpleInstall=1"
  Refresh-Path
}

function Install-Git {
  if (Has "git") { return }
  if (Has "winget") {
    Say "Installing Git (needed to download AI engines)..." "Cyan"
    winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
    Refresh-Path
  }
}

function Install-Ffmpeg {
  if (Has "ffmpeg") { return }
  if (Has "winget") {
    Say "Installing ffmpeg..." "Cyan"
    winget install -e --id Gyan.FFmpeg --accept-package-agreements --accept-source-agreements
    Refresh-Path
  }
}

Set-Location $AppDir
Say "Setting up The Muser. This can take several minutes..." "Yellow"
if (-not (Test-Python)) { Install-Python }
if (-not (Test-Python)) {
  Say "Python 3.10-3.12 is required. Install it from https://www.python.org/downloads/ then run setup_windows.bat" "Red"
  exit 1
}
Install-Git
Install-Ffmpeg

$setup = Join-Path $AppDir "setup_windows.ps1"
$setupArgs = @()
if ($Gpu) { $setupArgs += "-Gpu" }
& powershell -NoProfile -ExecutionPolicy Bypass -File $setup @setupArgs
exit $LASTEXITCODE
