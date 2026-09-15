# Changelog

Convenção: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e
[SemVer](https://semver.org/lang/pt-BR/). O Claude Code **não avisa automaticamente** quem já
instalou o plugin sobre uma versão nova — antes de rodar `/plugin marketplace update isabella-a` +
`/plugin update isabella@isabella-a`, confira esta página, especialmente em bump de major.

## [Não lançado]

- Adiciona suporte ao [Codex CLI](https://developers.openai.com/codex) no mesmo formato aberto
  `SKILL.md` do Claude Code (`name`/`description`), inclusive com marketplace versionado em
  `.agents/plugins/`: qualquer pessoa pode instalar `isabella@isabella-a` diretamente do GitHub,
  sem clonar este repositório. `scripts/install-codex.sh` continua como alternativa legada para
  cópia local de skills.
- Adiciona `scripts/sync-codex-plugin.mjs` e o hook versionado `hooks/pre-commit`: commits que
  alteram `skills/` sincronizam o bundle do Codex, geram o sufixo de versão
  `+codex.<timestamp>` e incluem os arquivos derivados no mesmo commit. O README documenta a
  instalação do hook e o fluxo de atualização por `codex plugin marketplace upgrade`.
- `sdd`/`spec-harness` passam a documentar os dois runtimes: `Skill`/`Agent` do Claude Code e
  leitura de `SKILL.md`/`spawn_agent` no Codex. A Fase 1 do SDD reconhece `grill-me` e
  `grill-with-docs` do conjunto Matt Pocock; no Codex esse conjunto é instalado via `skills.sh`,
  enquanto Ponytail é instalado como plugin nativo. As integrações continuam opcionais e usam
  procedimento manual equivalente se estiverem ausentes.
- `spec-harness`: remove todo gate e execução automática de revisão/CRAP. A revisão é manual na
  skill `code-review-skill`, que passa a concentrar as calculadoras CRAP para TypeScript/JavaScript
  e Python.

- Renomeia o plugin de `claude-skills` para `isabella` (`.claude-plugin/plugin.json` e
  `marketplace.json`) — o prefixo de invocação das skills passa a ser `isabella:sdd` etc. Quem já
  tinha instalado precisa desinstalar `claude-skills@isabella-a` e instalar `isabella@isabella-a`.

- `code-review-skill`: CRAP passa a cobrir também TS/JS via
  `eslintcc` (antes só Python via `radon`).
- `spec-harness`: três otimizações de token portadas do fork de terceiros
  [VitorMRCNeves/Spec-Harness](https://github.com/VitorMRCNeves/Spec-Harness) (as mudanças de lá
  que reintroduziam CRAP/revisão dentro do spec-harness foram avaliadas e descartadas —
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
- `spec-harness`: mais duas otimizações do mesmo fork, essas sim alinhadas com o corte de token já
  feito aqui (`implementer.reuse_session`/`lean_context`, padrão ligado, desliga sozinho em
  config sem `prompts.retomada` — repositório já configurado não quebra):
  - GREEN passa a **retomar a sessão headless do RED** (`--resume`) em vez de abrir sessão fria, e
    cada nova tentativa retoma a anterior — o que a assinatura cobra é contexto novo
    (`cache_creation` + `output`), não a releitura de prefixo já visto (`cache_read`), e uma
    sessão fria paga o piso de contexto (spec, orientação, docs) de novo em cada fase. O
    enforcement de path não afrouxa: o hook decide pela run ativa, trocada pelo harness a cada
    fase, então o GREEN continua sem poder escrever no teste do RED. O prompt de retomada
    (`implementer.prompts.retomada`) é curto de propósito — a sessão já tem tudo no contexto.
  - As sessões de fase passam a rodar com `--strict-mcp-config --setting-sources project,local`,
    descartando MCP e plugins de nível `user` (nenhum dos dois serve a um RED/GREEN escopado, e um
    plugin cujo hook falha em modo headless pode inflar contexto por tool call sem aviso); o hook
    de path scoping do harness é reinjetado por `--settings`, por caminho absoluto, para o
    enforcement não sair no pacote descartado.
  - Corrige também três lugares do motor com suposição de layout `app/` hardcoded (path na seção
    `## Arquivos permitidos`, desempate de escopo por prefixo exclusivo, `missing_module` do gate
    de RED) e um marcador de pytest específico de um repositório privado no detector de
    `init-repo` — nenhum dos dois tinha relação com token, mas quebravam silenciosamente
    `scaffold-packet`/`init-repo` em qualquer repositório com outra convenção de diretório.
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
