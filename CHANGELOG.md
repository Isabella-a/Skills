# Changelog

Convenção: [Keep a Changelog](https://keepachangelog.com/pt-BR/1.0.0/) e
[SemVer](https://semver.org/lang/pt-BR/). O Claude Code **não avisa automaticamente** quem já
instalou o plugin sobre uma versão nova — antes de rodar `/plugin marketplace update isabella-a` +
`/plugin update isabella@isabella-a`, confira esta página, especialmente em bump de major.

## [Não lançado]

## [2.0.1] - 2026-09-15

- `code-review-skill`: deixa de ser específica do stack do One Portal e passa a se ancorar no
  `PROJECT_MAP.md` do repositório onde roda — se ele não existir, avisa o usuário e pede permissão
  antes de gerá-lo via skill `project-map`. Guias de stack (NestJS, React) agora carregam
  condicionalmente, só quando o `PROJECT_MAP.md` indica aquela stack.
- `code-review-skill`: a revisão passa a rodar em **sub-agentes paralelos**, um por eixo
  (Architecture, Correctness & Security, Performance, Quality & Reuse, e Spec conformance quando
  há issue/spec de origem), cada um recebendo o diff + guia de referência colado inline +
  trecho do `PROJECT_MAP.md`. Os relatórios de cada eixo são apresentados à parte, nunca
  mesclados/reranqueados entre si — mesmo princípio do eixo Standards/Spec da skill `code-review`
  do plugin `mattpocock-skills`.
- `code-review-skill`: o cálculo de CRAP deixa de ser um passo opcional à parte e passa a ser
  responsabilidade obrigatória do eixo Quality & Reuse (que já tem `Bash`). Limiar cai de 30 para
  **20** (default nos dois calculadores, TS/JS e Python); toda função acima do limiar vira um
  finding obrigatório com o trecho de código já citado, não só o nome da função.
- `code-review-skill`: o eixo Spec conformance passa a exigir cobertura completa dos requisitos da
  spec (nada pode ficar de fora — isso bloqueia); implementação além do pedido continua sinalizada,
  mas só como aviso informativo de "fora do escopo", não como defeito.
- `code-review-skill`: `scripts/pr-analyzer.ts` perde os hardcodes de path do One Portal
  (`apps/backend`/`apps/frontend`) e a detecção de migration vira um padrão de nome de segmento de
  path (`*migrations?`) em vez de string fixa.

## [2.0.0] - 2026-09-15

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
- `spec-harness`: mais três cortes de token no runtime `claude` do implementer:
  - `token_budget` do packet (antes só validado, nunca comunicado à sessão) passa a ser injetado
    como instrução explícita no prompt inicial da fase — a única forma barata de fazer valer sem
    hook para truncar Read/Grep.
  - `--exclude-dynamic-system-prompt-sections`, sempre ligada: move cwd/env/git-status (que mudam
    a cada worktree de spec) do system prompt para a primeira mensagem, permitindo que o bloco
    estático do system prompt padrão do Claude Code cacheie entre specs diferentes em vez de
    invalidar a cada worktree novo.
  - `implementer.max_budget_usd` (opcional, desligado por padrão): passa `--max-budget-usd` como
    freio de emergência por invocação contra uma sessão presa em loop sem convergir.
  - `allowed_tools` do template não inclui mais `TodoWrite`: o orquestrador nunca lê a lista de
    todos de uma sessão headless, então cada chamada era turno pago sem efeito em gate ou revisão.

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
