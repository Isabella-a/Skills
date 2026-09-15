param(
  [string]$RepositoryRoot = (Split-Path -Parent $PSScriptRoot)
)

$source = Join-Path $RepositoryRoot 'skills'
$destination = Join-Path $RepositoryRoot '.agents\plugins\plugins\isabella\skills'

if (-not (Test-Path -LiteralPath $source)) {
  throw "Skills source directory not found: $source"
}

New-Item -ItemType Directory -Force -Path $destination | Out-Null
Get-ChildItem -LiteralPath $source -Directory | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination $destination -Recurse -Force
}

Write-Host "Codex plugin skills synchronized to $destination"
