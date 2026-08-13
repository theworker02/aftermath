# Link this repo into Cursor's local plugin development directory.
$ErrorActionPreference = "Stop"
$Root = Resolve-Path (Join-Path $PSScriptRoot "..")
$TargetDir = Join-Path $env:USERPROFILE ".cursor\plugins\local"
$Target = Join-Path $TargetDir "aftermath"
New-Item -ItemType Directory -Force -Path $TargetDir | Out-Null
if (Test-Path $Target) {
  Remove-Item -Force -Recurse $Target
}
try {
  New-Item -ItemType Junction -Path $Target -Target $Root | Out-Null
  Write-Host "Linked $Root -> $Target"
} catch {
  Write-Host "Junction failed; copying instead..."
  Copy-Item -Recurse -Force $Root $Target
  Write-Host "Copied $Root -> $Target"
}
Write-Host "Reload Cursor window (Developer: Reload Window) to pick up the local plugin."
