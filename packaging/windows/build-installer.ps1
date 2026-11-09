# Build The Muser full Windows installer (Inno Setup).
# Requires: Node.js 20+, Python 3.10+, Inno Setup Compiler (ISCC.exe in PATH)
# Run from the repo root:  .\packaging\windows\build-installer.ps1
# This packages the Studio plus a pre-built web UI. The Setup.exe creates a
# real Python venv on the user's PC so Engines -> Install works.

$ErrorActionPreference = "Stop"
$Root = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $Root

Write-Host "Building web UI..." -ForegroundColor Cyan
Push-Location studio/web
if (Test-Path package-lock.json) { npm ci } else { npm install }
npm run build
Pop-Location

Write-Host "Staging installer payload..." -ForegroundColor Cyan
python packaging\windows\stage-payload.py
if ($LASTEXITCODE -ne 0) { throw "stage-payload.py failed" }

Write-Host "Compiling Inno Setup installer..." -ForegroundColor Cyan
$Iss = "$Root\packaging\windows\muser.iss"
$iscc = Get-Command iscc -ErrorAction SilentlyContinue
if (-not $iscc) {
  $guess = @(
    "$env:LocalAppData\Programs\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe"
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($guess) { $iscc = $guess }
}

if ($iscc) {
  & $iscc "/DAppVersion=1.1.0" $Iss
  Write-Host "Installer written to dist/installer/TheMuser-Setup-1.1.0-win64.exe" -ForegroundColor Green
} else {
  Write-Host "Inno Setup Compiler (iscc) not found. Install from https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
  Write-Host "Payload is at dist/installer-payload/. Compile packaging/windows/muser.iss after installing Inno Setup." -ForegroundColor Yellow
}
