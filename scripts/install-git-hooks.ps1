$repositoryRoot = Split-Path -Parent $PSScriptRoot
git -C $repositoryRoot config core.hooksPath hooks

if ($LASTEXITCODE -ne 0) {
  throw 'Could not configure the repository Git hooks path.'
}

Write-Host 'Git hooks enabled for this repository.'
