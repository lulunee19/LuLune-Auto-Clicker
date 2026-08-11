$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not (Test-Path (Join-Path $root 'LuLuneAutoClicker.exe'))) {
  $alt = Join-Path $env:USERPROFILE 'Downloads\LuLuneAutoClicker-Windows\LuLuneAutoClicker-win32-x64'
  if (Test-Path (Join-Path $alt 'LuLuneAutoClicker.exe')) { $root = $alt }
}

Get-ChildItem -LiteralPath $root -Recurse -Force | Unblock-File
Get-ChildItem -LiteralPath $root -Recurse -Force | ForEach-Object {
  Remove-Item -LiteralPath ($_.FullName + ':Zone.Identifier') -Force -ErrorAction SilentlyContinue
}

$exe = Join-Path $root 'LuLuneAutoClicker.exe'
if (Test-Path $exe) { Start-Process -FilePath $exe }
