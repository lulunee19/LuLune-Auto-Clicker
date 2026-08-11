# Signe LuLuneAutoClicker.exe (supprime l'avertissement "telechargement dangereux" / SmartScreen
# une fois le certificat reconnu).
#
# Il te faut un certificat Authenticode (fichier .pfx) :
#   - Achete chez DigiCert, Sectigo, SSL.com, etc.
#   - Ou Azure Trusted Signing
#
# Usage:
#   $env:LULUNE_PFX = "C:\chemin\cert.pfx"
#   $env:LULUNE_PFX_PASSWORD = "motdepasse"
#   .\scripts\sign-windows.ps1
#
# Optionnel:
#   $env:LULUNE_EXE = "C:\...\LuLuneAutoClicker.exe"

$ErrorActionPreference = 'Stop'

$exe = $env:LULUNE_EXE
if (-not $exe) {
  $candidates = @(
    (Join-Path $PSScriptRoot '..\dist\LuLuneAutoClicker-win32-x64\LuLuneAutoClicker.exe'),
    (Join-Path $env:USERPROFILE 'Downloads\LuLuneAutoClicker-Windows\LuLuneAutoClicker-win32-x64\LuLuneAutoClicker.exe')
  ) | ForEach-Object { [IO.Path]::GetFullPath($_) }
  $exe = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}

$pfx = $env:LULUNE_PFX
$pwd = $env:LULUNE_PFX_PASSWORD

if (-not $exe -or -not (Test-Path $exe)) {
  Write-Error "Exe introuvable. Definissez LULUNE_EXE ou buildez avec npm run package:win"
}
if (-not $pfx -or -not (Test-Path $pfx)) {
  Write-Error "Certificat .pfx manquant. Definissez LULUNE_PFX (chemin du .pfx)"
}
if (-not $pwd) {
  Write-Error "Definissez LULUNE_PFX_PASSWORD"
}

$signtool = @(
  "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
  "${env:ProgramFiles}\Windows Kits\10\bin\*\x64\signtool.exe"
) | Get-Item -ErrorAction SilentlyContinue | Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName

if (-not $signtool) {
  Write-Error "signtool.exe introuvable. Installez Windows SDK (Signing Tools)."
}

Write-Host "Signature de $exe"
& $signtool sign /fd SHA256 /tr http://timestamp.digicert.com /td SHA256 /f $pfx /p $pwd $exe
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& $signtool verify /pa $exe
Write-Host "OK — exe signe."
