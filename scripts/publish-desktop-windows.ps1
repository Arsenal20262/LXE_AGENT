[CmdletBinding()]
param([ValidateSet("publish","pause")][string]$Action = "publish", [string]$Candidate)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$OutputEncoding = [Text.UTF8Encoding]::new($false)
$credential = Import-Clixml -LiteralPath (Join-Path $env:LOCALAPPDATA 'LXE\release\cos-credential.xml')
$script = Join-Path $PSScriptRoot 'desktop-release.ts'
@{secretId=$credential.UserName;secretKey=$credential.GetNetworkCredential().Password} |
 ConvertTo-Json -Compress | & bun $script $Action $Candidate
if ($LASTEXITCODE -ne 0) { throw 'Publication failed; inspect the diagnostic above.' }
