# GitHub Repository Configuration

Este workspace usa a seguinte configuração de GitHub:

- **Owner:** <owner>
- **Repo:** <repo>
- **Default branch (repo):** main
- **Base padrão de PRs:** `develop` — **sempre confirme a base com o usuário** ao criar PR,
  sugerindo `develop`. `main` só para releases.
- **URL:** https://github.com/<owner>/<repo>

## Convenções do repo

- **Títulos de PR e commits** seguem **Conventional Commits**
  (`feat(scope): …`, `fix(scope): …`, `chore`, `refactor`, `test`, `docs`, `perf`, `build`, `ci`).
- **Base do PR:** use `--base develop` por padrão. Só use `--base main` em PRs de release.
- **Título de PR:** `[PROJ-XXXX] <summary do card no Jira>` (tag extraído da branch + summary
  via `jira-assistant`, ou perguntado). **Não** é Conventional Commits — isso vale só p/ commits.
- **Body de PR:** preenchido a partir de `.github/pull_request_template.md`, com a Descrição
  vinda da introspecção do diff vs a base e o Link da atividade montado com o tag `PROJ-XXXX`.
- **Merge:** prefira **squash** salvo indicação contrária.
- **CI separado por `paths:`** — mudança só de backend não dispara o CI do frontend e vice-versa.
- Vincule a issue no corpo do PR com `Closes #N`.

## Ferramenta

- **`gh` CLI** é o mecanismo deste skill.
- Autenticar: `gh auth login` (scopes `repo` e `workflow`).
- Conferir: `gh auth status`.
- Dentro do diretório do repo, o `gh` infere `owner/repo`; use `-R <owner>/<repo>`
  para operar de fora do diretório.

> **Template.** Valores de exemplo — não commite dados reais de empresa neste repositório público.
> Sem config, a skill usa `gh repo view` / git remote do workspace. Convenções reais (prefixo de
> ticket, base de PR) ficam no `CLAUDE.md`/`AGENTS.md` do repositório interno.
