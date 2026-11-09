; Full Windows installer for The Muser.
; Copies the Studio (with a pre-built web UI) and runs post-install.ps1 so a real
; Python venv is created. Engines -> Install works after that.
; Build: python packaging/windows/stage-payload.py && iscc /DAppVersion=1.1.0 packaging\windows\muser.iss
#ifndef AppVersion
  #define AppVersion "1.1.0"
#endif

[Setup]
AppId={{6F4C3B1E-7B1A-4E55-9D50-4D6E7A2C1A11}
AppName=The Muser
AppVersion={#AppVersion}
AppPublisher=The Muser Contributors
AppPublisherURL=https://github.com/myaiplug/the-muser
AppSupportURL=https://github.com/myaiplug/the-muser/issues
DefaultDirName={autopf}\The Muser
DefaultGroupName=The Muser
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\..\dist\installer
OutputBaseFilename=TheMuser-Setup-{#AppVersion}-win64
SetupIconFile=..\icon.ico
UninstallDisplayIcon={app}\packaging\icon.ico
Compression=lzma2/normal
SolidCompression=yes
WizardStyle=modern
LicenseFile=..\..\LICENSE
; Extra disk for Python, Git, ffmpeg, venv and models after install.
ExtraDiskSpaceRequired=3221225472

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Shortcuts:"
Name: "gpu"; Description: "Install NVIDIA GPU support (CUDA PyTorch — needed for ACE-Step and other AI engines)"; GroupDescription: "AI engines:"; Flags: checkedonce

[Files]
Source: "..\..\dist\installer-payload\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\The Muser"; Filename: "{app}\TheMuser.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\packaging\icon.ico"
Name: "{autodesktop}\The Muser"; Filename: "{app}\TheMuser.cmd"; WorkingDir: "{app}"; IconFilename: "{app}\packaging\icon.ico"; Tasks: desktopicon

[Run]
Filename: "powershell.exe"; Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\packaging\windows\post-install.ps1"" -AppDir ""{app}"" {code:GpuFlag}"; StatusMsg: "Installing Python packages and the Studio (this can take several minutes)..."; Flags: waituntilterminated
Filename: "{app}\TheMuser.cmd"; Description: "Launch The Muser"; Flags: nowait postinstall skipifsilent

[Messages]
FinishedLabel=The Muser is installed. Open it from the Start menu — it starts a local server and opens the Studio in your browser.%n%nYour tracks, exports and downloaded models are kept in %LOCALAPPDATA%\TheMuser, so uninstalling never deletes your music.%n%nIn the Studio, open Engines and press Install on a model marked Fits (start with ACE-Step 1.5). For the chat assistant, install Ollama from https://ollama.com/download (optional).

[Code]
function GpuFlag(Param: String): String;
begin
  if WizardIsTaskSelected('gpu') then
    Result := '-Gpu'
  else
    Result := '';
end;
