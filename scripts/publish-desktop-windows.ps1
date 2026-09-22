[CmdletBinding()]
param([ValidateSet("publish","pause")][string]$Action = "publish", [string]$Candidate)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$credential = Import-Clixml -LiteralPath (Join-Path $env:LOCALAPPDATA 'LXE\release\cos-credential.xml')
$script = Join-Path $PSScriptRoot 'desktop-release.ts'
if ($Action -eq 'publish') {
 if (!$Candidate) { throw 'Pass the candidate.json path with -Candidate.' }
 $Candidate = (Resolve-Path -LiteralPath $Candidate -ErrorAction Stop).Path
}
Write-Host "Starting desktop release action: $Action"
$completed = $false
@{secretId=$credential.UserName;secretKey=$credential.GetNetworkCredential().Password} |
 ConvertTo-Json -Compress | & bun $script $Action $Candidate | ForEach-Object {
  Write-Host $_
  if (($Action -eq 'publish' -and $_ -match '^Published ') -or
      ($Action -eq 'pause' -and $_ -eq 'Stable channel paused')) { $completed = $true }
 }
if ($LASTEXITCODE -ne 0) { throw 'Publication failed; inspect the diagnostic above.' }
if (!$completed) { throw 'Publisher exited without confirming completion. Publication is not confirmed.' }
