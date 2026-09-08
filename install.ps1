#requires -version 5
<#
.SYNOPSIS
  Instala (via link simbolico) as skills e o motor deste repositorio em ~/.claude,
  tornando-os disponiveis globalmente para o Claude Code em qualquer projeto.
#>

$ErrorActionPreference = 'Stop'

function Install-Link {
    param(
        [Parameter(Mandatory)] [string]$Source,
        [Parameter(Mandatory)] [string]$Target,
        [Parameter(Mandatory)] [string]$Label
    )

    $targetParent = Split-Path -Parent $Target
    if (-not (Test-Path $targetParent)) {
        New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
    }

    if (Test-Path $Target) {
        $existing = Get-Item $Target -Force
        $isOurLink = $existing.LinkType -and ($existing.Target -eq $Source)
        if ($isOurLink) {
            Write-Host "OK (ja instalada) - $Label"
            return
        }
        Write-Host "Substituindo instalacao existente de '$Label'..."
        Remove-Item $Target -Recurse -Force
    }

    try {
        New-Item -ItemType SymbolicLink -Path $Target -Target $Source | Out-Null
        Write-Host "Link criado  - $Label"
    }
    catch {
        Write-Warning "Sem permissao para link simbolico (ative o Modo de Desenvolvedor para linkar em vez de copiar). Copiando arquivos para '$Label'."
        Copy-Item -Path $Source -Destination $Target -Recurse -Force
        Write-Host "Copiada     - $Label"
    }
}

# Skills -> ~/.claude/skills/<nome>
$repoSkillsDir = Join-Path $PSScriptRoot 'skills'
$globalSkillsDir = Join-Path $HOME '.claude\skills'
foreach ($skill in Get-ChildItem -Path $repoSkillsDir -Directory) {
    Install-Link -Source $skill.FullName -Target (Join-Path $globalSkillsDir $skill.Name) -Label $skill.Name
}

# Motor do spec-harness -> ~/.claude/spec_harness
$repoEngineDir = Join-Path $PSScriptRoot 'spec_harness'
if (Test-Path $repoEngineDir) {
    $globalEngineDir = Join-Path $HOME '.claude\spec_harness'
    Install-Link -Source $repoEngineDir -Target $globalEngineDir -Label 'spec_harness (motor)'
}

Write-Host ""
Write-Host "Instalado em: $globalSkillsDir e $(Join-Path $HOME '.claude\spec_harness')"
