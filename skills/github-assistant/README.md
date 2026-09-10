# GitHub Assistant Skill

Operações de GitHub (Pull Requests, Issues, repos & branches) via **`gh` CLI**. Detecta
automaticamente o `owner/repo` do workspace a partir do `github-config.md` ou do git remote.

## Pré-requisitos

### `gh` CLI autenticado

```bash
gh auth status          # confere
gh auth login           # se necessário (scopes: repo, workflow)
```

No Claude Code, para um login interativo rode `! gh auth login` na sua sessão (o prefixo `!`
executa o comando na própria sessão).

## Configuração

A skill detecta `owner`/`repo`/`defaultBranch` nesta ordem:

1. **`github-config.md`** (ao lado do `SKILL.md`) — recomendado.
2. **git remote / `gh repo view`** do workspace.
3. **Prompt interativo** se ainda estiver indefinido.

Exemplo de `github-config.md`:

```markdown
# GitHub Repository Configuration

- **Owner:** YOUR_ORG
- **Repo:** your-repo
- **Default branch:** main
- **URL:** https://github.com/YOUR_ORG/your-repo
```

## Operações cobertas

- **Pull Requests:** criar, listar, ver detalhes/arquivos/diff, status de checks, comentar,
  revisar (incl. comentários inline via API), atualizar, fazer merge.
- **Issues:** criar, buscar, atualizar, comentar, atribuir, fechar.
- **Repos & branches:** branches, commits, arquivos, busca de código.

## Convenções importantes

- **`--json` + `--jq`** para leitura (saída estável e parseável).
- **`--body-file`** para corpos longos de PR/issue (evita heredoc frágil).
- **Sem flags interativas** — passe tudo por flag.
- **Confirmação antes de merge/close** — ações difíceis de reverter.

## Troubleshooting

**`gh: command not found`:**

- Instale o GitHub CLI: https://cli.github.com — e rode `gh auth login`.

**`gh auth status` diz não autenticado:**

- Rode `! gh auth login` na sessão; garanta scopes `repo` e `workflow`.

**Repo errado sendo usado:**

- Ajuste `github-config.md`, ou passe `-R OWNER/REPO` no comando.

**PR não cria por falta de push:**

- Garanta `git push -u origin <branch>` antes do `gh pr create`.

## Compatibilidade

- Claude Code (config via `github-config.md` na pasta do skill)
- Detecção por git remote / `gh repo view` em qualquer workspace
