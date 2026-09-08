#requires -version 5
<#
.SYNOPSIS
  Instala (via link simbolico) as skills deste repositorio em ~/.claude/skills,
  tornando-as disponiveis globalmente para o Claude Code em qualquer projeto.
#>

$ErrorActionPreference = 'Stop'

$repoSkillsDir = Join-Path $PSScriptRoot 'skills'
$globalSkillsDir = Join-Path $HOME '.claude\skills'

if (-not (Test-Path $globalSkillsDir)) {
    New-Item -ItemType Directory -Path $globalSkillsDir -Force | Out-Null
}

$skills = Get-ChildItem -Path $repoSkillsDir -Directory

foreach ($skill in $skills) {
    $target = Join-Path $globalSkillsDir $skill.Name
    $source = $skill.FullName

    if (Test-Path $target) {
        $existing = Get-Item $target -Force
        $isOurLink = $existing.LinkType -and ($existing.Target -eq $source)
        if ($isOurLink) {
            Write-Host "OK (ja instalada) - $($skill.Name)"
            continue
        }
        Write-Host "Substituindo instalacao existente de '$($skill.Name)'..."
        Remove-Item $target -Recurse -Force
    }

    try {
        New-Item -ItemType SymbolicLink -Path $target -Target $source | Out-Null
        Write-Host "Link criado  - $($skill.Name)"
    }
    catch {
        Write-Warning "Sem permissao para link simbolico (ative o Modo de Desenvolvedor para linkar em vez de copiar). Copiando arquivos para '$($skill.Name)'."
        Copy-Item -Path $source -Destination $target -Recurse -Force
        Write-Host "Copiada     - $($skill.Name)"
    }
}

Write-Host ""
Write-Host "Skills instaladas em: $globalSkillsDir"
