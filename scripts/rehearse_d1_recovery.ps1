[CmdletBinding()]
param(
  [switch]$RemoteBookmarkCheck
)

$ErrorActionPreference = "Stop"
$repositoryRoot = Split-Path -Parent $PSScriptRoot
$wranglerEntry = Join-Path $repositoryRoot "node_modules/wrangler/bin/wrangler.js"

if ($RemoteBookmarkCheck) {
  if (-not (Test-Path -LiteralPath $wranglerEntry -PathType Leaf)) {
    throw "Locked dependencies are missing. Run npm ci first."
  }
  $bookmarkOutput = & node $wranglerEntry @(
    "d1", "time-travel", "info", "DB", "--env", "production", "--json"
  ) 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($bookmarkOutput -join [Environment]::NewLine)
  }
  $bookmarkText = $bookmarkOutput -join ""
  if ($bookmarkText -notmatch '"bookmark"\s*:\s*"[^"\s]+"') {
    throw "Cloudflare returned no current Time Travel bookmark."
  }
  Write-Output "TIME_TRAVEL_BOOKMARK_CHECK=PASS"
  Write-Output "TIME_TRAVEL_PRODUCTION_MUTATION=NOT_RUN"
  exit 0
}

$nodeRehearsal = Join-Path $PSScriptRoot "rehearse_d1_recovery.mjs"
if (-not (Test-Path -LiteralPath $nodeRehearsal -PathType Leaf)) {
  throw "Recovery rehearsal implementation is missing."
}

& node $nodeRehearsal
exit $LASTEXITCODE
