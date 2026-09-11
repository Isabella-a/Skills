# Changelog

Convenção: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e
[SemVer](https://semver.org/lang/pt-BR/). O Claude Code **não avisa automaticamente** quem já
instalou o plugin sobre uma versão nova — antes de rodar `/plugin marketplace update isabella-a` +
`/plugin update claude-skills@isabella-a`, confira esta página, especialmente em bump de major.

## [Não lançado]

- `spec-harness`: corte no consumo de token por spec; CRAP passa a cobrir também TS/JS via
  `eslintcc` (antes só Python via `radon`).
- `spec-harness`: três otimizações de token portadas do fork de terceiros
  [VitorMRCNeves/Spec-Harness](https://github.com/VitorMRCNeves/Spec-Harness) (as mudanças de lá
  que reintroduziam CRAP/revisão por spec em vez de por feature foram avaliadas e descartadas —
  vão na direção oposta do corte de token já feito aqui):
  - `required_reads` do packet passa a ser injetado como instrução explícita no prompt da fase
    ("leia isto antes de explorar"), não só como leitura permitida — evita a sessão gastar
    Read/Grep/Glob se orientando sozinha no repositório.
  - `docs.por_fase` (opcional) no `harness.config.json` injeta, por fase, só os docs grandes de
    `docs/` que ela precisa — evita reler documentação importada eager pelo `CLAUDE.md` em todo
    turno da fase.
  - `doctor` passa a reprovar `scaffold.test_command_template` quando o binário do comando existe
    localmente mas não é rastreado pelo git nem coberto por `worktree.copy_paths`/`link_paths` —
    esse binário não existiria no worktree da spec (que nasce da branch) e a fase morreria com
    exit 127 depois de a sessão gastar turnos caçando o arquivo. A sessão da fase também recebe
    instrução para abortar de imediato num exit 126/127 em vez de investigar.
- Remove a skill `drizzle-migration` (referência específica de projeto, não generalizável).
- `sdd`: renumera as fases para começar em 0 (`0`-`6`, antes `-2`..`4`).
- Adiciona 6 skills que faltavam em relação ao one-portal-monorepo (`sdd-jira-sync`,
  `github-assistant`, `jira-assistant`, `aws-debugger`, `code-review-skill`, entre outras).

## [1.1.0] - 2026-09-08

- Adiciona a skill `project-map`; `sdd`/`spec-harness` passam a delegar a ela a descoberta de
  stack e arquitetura do repositório em vez de reinferir a cada execução.
- Declara `mattpocock-skills` e `ponytail` como dependências reais do plugin
  (`.claude-plugin/plugin.json`), instaladas automaticamente junto com `claude-skills`.
- Remove menção ao Graphify do README.

## [1.0.0] - 2026-09-08

- Empacota o repositório como plugin do Claude Code — instalação via `/plugin`, sem `git clone`
  nem scripts manuais.
- Adiciona as skills `sdd` + `spec-harness` e o motor global (`spec_harness/`).
- Adiciona o repositório inicial de skills genéricas (`nestjs-modular-monolith`,
  `react-best-practices`, `monorepo-management`).
- Reescreve o README como catálogo voltado ao usuário final do plugin.
