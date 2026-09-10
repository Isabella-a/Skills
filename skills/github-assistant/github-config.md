# GitHub Repository Configuration

Este workspace usa a seguinte configuração de GitHub:

- **Owner:** OneInvestimentos
- **Repo:** one-portal-monorepo
- **Default branch (repo):** main
- **Base padrão de PRs:** `develop` — **sempre confirme a base com o usuário** ao criar PR,
  sugerindo `develop`. `main` só para releases.
- **URL:** https://github.com/OneInvestimentos/one-portal-monorepo

## Convenções do repo

- **Títulos de PR e commits** seguem **Conventional Commits**
  (`feat(scope): …`, `fix(scope): …`, `chore`, `refactor`, `test`, `docs`, `perf`, `build`, `ci`).
- **Base do PR:** use `--base develop` por padrão. Só use `--base main` em PRs de release.
- **Título de PR:** `[DEVPO-XXXX] <summary do card no Jira>` (tag extraído da branch + summary
  via `jira-assistant`, ou perguntado). **Não** é Conventional Commits — isso vale só p/ commits.
- **Body de PR:** preenchido a partir de `.github/pull_request_template.md`, com a Descrição
  vinda da introspecção do diff vs a base e o Link da atividade montado com o tag `DEVPO-XXXX`.
- **Merge:** prefira **squash** salvo indicação contrária.
- **CI separado por `paths:`** — mudança só de backend não dispara o CI do frontend e vice-versa.
- Vincule a issue no corpo do PR com `Closes #N`.

## Ferramenta

- **`gh` CLI** é o mecanismo deste skill.
- Autenticar: `gh auth login` (scopes `repo` e `workflow`).
- Conferir: `gh auth status`.
- Dentro do diretório do repo, o `gh` infere `owner/repo`; use `-R OneInvestimentos/one-portal-monorepo`
  para operar de fora do diretório.
