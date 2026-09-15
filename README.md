# Skills

Coleção de [Skills](https://agentskills.io) genéricas no formato aberto `SKILL.md`, para uso no
[Claude Code](https://claude.com/claude-code) e no [Codex CLI](https://developers.openai.com/codex)
— as duas ferramentas leem o mesmo formato (frontmatter `name` + `description`), só mudam a forma
de instalar. Instale uma vez e as skills ficam disponíveis automaticamente em **qualquer**
repositório da sua máquina — sem precisar copiar nada projeto a projeto.

Cada skill é reaproveitável por design: nenhuma delas assume convenções, nomes ou estrutura de um
projeto específico. Se você precisa de uma skill amarrada às regras de um repositório em
particular, ela deve viver no `.claude/skills/` (Claude Code) ou `.agents/skills/` (Codex CLI)
daquele repositório, não aqui.

## Pré-requisitos

- [Claude Code](https://claude.com/claude-code) e/ou [Codex CLI](https://developers.openai.com/codex) instalado.
- Para usar as skills `sdd` / `spec-harness`: [Node.js](https://nodejs.org) recente (22.6+), com
  suporte nativo à execução de arquivos `.ts`, e o CLI do runtime escolhido no PATH: `codex`
  (padrão em instalações Codex) ou `claude` (compatibilidade com Claude Code).

## Instalação

<details>
<summary><strong>Codex</strong></summary>

### Plugin

O marketplace versionado permite instalar as skills como plugin no Codex, em qualquer computador,
sem clonar o repositório e sem afetar a instalação do Claude Code:

```powershell
codex plugin marketplace add Isabella-a/Skills --ref main --sparse .agents/plugins
codex plugin add isabella@isabella-a
```

Para desenvolvimento local, use `codex plugin marketplace add .`. Após alterar
uma skill, rode `powershell -ExecutionPolicy Bypass -File scripts\sync-codex-plugin.ps1`, versione
e publique as mudanças antes de qualquer outra pessoa instalar a versão atualizada.

#### Atualização do plugin

Quem mantém o plugin deve fazer commit e publicar em `main`. Com o hook de automação instalado,
o bundle e a versão são atualizados no próprio commit; sem o hook, rode
`powershell -ExecutionPolicy Bypass -File scripts\sync-codex-plugin.ps1` e atualize a versão do
manifesto manualmente antes de publicar.

Quem já instalou o plugin atualiza o marketplace remoto e reinstala o bundle:

```powershell
codex plugin marketplace upgrade isabella-a
codex plugin add isabella@isabella-a
```

Abra uma nova conversa do Codex depois da reinstalação para carregar as skills atualizadas.

#### Automação no commit

Instale uma vez o hook versionado deste repositório:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-git-hooks.ps1
```

Em commits que alterem `skills/`, o hook sincroniza automaticamente o bundle Codex, acrescenta
`+codex.<timestamp>` à versão do plugin e inclui os arquivos gerados no mesmo commit. Para manter
o bundle determinístico, todas as alterações em `skills/` devem estar staged antes do commit.

### Integrações opcionais

O manifesto do Codex não oferece um campo `dependencies` para instalar plugins de outros
marketplaces em cascata. Por isso, o bundle `isabella` inclui todas as skills deste repositório que
são compatíveis com Codex. As integrações externas devem ser instaladas uma vez, pelo mecanismo
que cada projeto oferece:

```powershell
# Ponytail: plugin nativo do Codex
codex plugin marketplace add DietrichGebert/ponytail
codex plugin add ponytail@ponytail

# Matt Pocock: skills compatíveis com Codex, instaladas no projeto pelo skills.sh
npx skills@latest add mattpocock/skills
```

No instalador de Matt Pocock, selecione `grill-me` (ou `grill-with-docs`) para a entrevista da
Fase 1 do `sdd`, e `code-review` se quiser a revisão complementar. Ponytail disponibiliza
`ponytail-review` e `ponytail-debt` como skills do Codex. Essas integrações continuam opcionais:
se não estiverem presentes, as skills Isabella aplicam o procedimento manual equivalente.

Para desenvolvimento sem marketplace, o instalador legado ainda pode copiar as skills para
`~/.agents/skills` (global) ou `.agents/skills` (local):

```bash
./scripts/install-codex.sh
./scripts/install-codex.sh --local
```

</details>

<details>
<summary><strong>Claude Code</strong></summary>

### Plugin

Dentro do Claude Code, em qualquer repositório:

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin marketplace add DietrichGebert/ponytail
/plugin marketplace add Isabella-a/Skills
/plugin install isabella@isabella-a
```

Não é preciso `git clone` nem rodar nenhum script — o Claude Code busca e mantém o plugin
atualizado sozinho. O manifesto `.claude-plugin/plugin.json` declara nativamente as duas
dependências: `mattpocock-skills@claude-plugins-official` e `ponytail@ponytail`. As duas primeiras
marketplaces precisam existir antes do `/plugin install`; sem elas, o plugin fica com status
"failed to load" até que sejam adicionadas.

#### Verificando a instalação

```
/plugin
```

Abra a lista de plugins instalados e confirme `isabella`. Ou digite `/` em qualquer
repositório para ver as skills na lista de comandos, ou simplesmente descreva a tarefa em
linguagem natural — o Claude reconhece o pedido e ativa a skill certa sozinho.

</details>

## Skills disponíveis

Todas as skills abaixo são genéricas, no espírito descrito acima.

**Comece por `project-map`.** As outras skills deste plugin dão conselho genérico até
saberem em que repositório estão — `project-map` é o que muda isso. Rode uma vez por repositório
(as outras skills verificam sozinhas se falta e perguntam antes de gerar) e o resultado
(`PROJECT_MAP.md`) é o que faz `react-best-practices` sugerir a lib de estado que o projeto já
usa em vez de uma genérica, e `sdd`/`spec-harness` gerarem specs e código no padrão real do
repositório em vez de inventar um.

| Skill | O que faz | Como acionar |
|---|---|---|
| [`project-map`](skills/project-map) | Mapeia o repositório (linguagens, bibliotecas, arquitetura, estilos/CSS global, testes, CI/deploy, segurança, observabilidade) e gera `PROJECT_MAP.md` na raiz — a base de contexto que as demais skills leem antes de agir. | Peça "mapeia esse projeto" ou "gera o PROJECT_MAP.md". As outras skills também oferecem rodá-la sozinhas quando notam que falta. |
| [`react-best-practices`](skills/react-best-practices) | Boas práticas de performance para React/Next.js (Vercel Engineering) — data fetching, bundle, renderização. | Ativa ao escrever, revisar ou refatorar componentes React/Next.js. |
| [`sdd`](skills/sdd) | Quebra uma entrega em specs construíveis — documentos de Spec-Driven Design, um por unidade testável, antes de qualquer código. | `/sdd <descrição da feature>`, `/sdd ABC-1234` (busca o ticket antes) ou peça "escreve um spec para X". |
| [`spec-harness`](skills/spec-harness) | Implementa cada spec gerada pela `sdd` em RED→GREEN→VERIFY, num git worktree isolado, com enforcement de path. | Automática, depois que a pasta `.specs/sdd-<feature>/` já existir. |
| [`sdd-jira-sync`](skills/sdd-jira-sync) | Sincroniza as specs de uma feature `sdd` (`.specs/sdd-<feature>/specs/*.md`) como Subtarefas de uma história já existente no Jira — reaproveita subtarefas que já batem com o escopo e cria as que faltarem. | Peça "sobe as specs do sdd-<feature> pro Jira, vinculadas na história <CHAVE>" ou "sincroniza as specs com a <CHAVE>". Depende da skill `jira-assistant` para configuração. |
| [`github-assistant`](skills/github-assistant) | Gerencia GitHub via `gh` CLI — Pull Requests, Issues, branches e commits. Detecta automaticamente o owner/repo do workspace (`github-config.md` ou git remote). | Peça para abrir/revisar/mergear um PR, criar uma issue, listar PRs abertos, ver checks de CI ou comparar branches. |
| [`jira-assistant`](skills/jira-assistant) | Gerencia issues do Jira via Atlassian MCP — busca, cria, atualiza, transiciona status, comentários e KTLOs. Detecta a configuração do workspace automaticamente (`jira-config.md`). | Peça para criar/buscar/atualizar uma issue, mover para outro status, comentar ou "cadastrar um KTLO". |
| [`code-review-skill`](skills/code-review-skill) | Revisão de código genérica, ancorada no `PROJECT_MAP.md` deste repo (gera na hora, com permissão, se faltar). Roda em sub-agentes paralelos — Architecture, Correctness & Security, Performance, Quality & Reuse (inclui CRAP, limiar 20) e Spec conformance (quando há issue/spec de origem) — cada eixo relatado à parte, nunca mesclado. | Ativa ao revisar PRs/mudanças de código, em qualquer stack. |

### `project-map` em detalhe

Não usa nenhuma ferramenta externa — só `Read`/`Glob`/`Grep`/`Bash`, sem dependência nova. Gera
um documento único e versionado (`PROJECT_MAP.md`), com origem citada em cada afirmação não
óbvia, cobrindo: identidade do projeto, stack e runtime, frameworks e bibliotecas por categoria,
arquitetura e estrutura real, estilos/design system, testes, ambiente local, CI/CD e deploy,
segurança e configuração, observabilidade/feature flags, convenções de código observadas,
integrações externas e fluxo de trabalho. Se adapta sozinha a monorepo (uma linha por workspace)
ou projeto único (uma linha só).

O documento abre com uma **Seção 0 — índice de leitura por escopo** (progressive disclosure):
uma tabela fixa que diz, por tipo de tarefa, quais seções são relevantes. `sdd` e `spec-harness`
leem essa seção primeiro e depois só as seções que o escopo da spec exige — nunca o arquivo
inteiro a cada fase/spec, que é o padrão de leitura mais caro do fluxo `sdd`/`spec-harness`.

### `sdd` + `spec-harness` em detalhe

Essas duas skills se encadeiam: `sdd` produz as specs, `spec-harness` as implementa. Na primeira
execução em um repositório novo, elas se auto-configuram:

1. `sdd` garante que `PROJECT_MAP.md` existe (delegando à skill `project-map` se faltar) e grava
   `.claude/sdd/perfil.md` só com o que é específico de spec — a unidade de entrega.
2. `spec-harness` roda `init-repo` / `doctor` para gerar `.claude/spec_harness/harness.config.json`
   e registrar o hook de enforcement de path — nada disso precisa ser configurado manualmente.

Este plugin declara duas dependências reais (`.claude-plugin/plugin.json`), instaladas junto com
`isabella` desde que as marketplaces delas já tenham sido adicionadas (ver Instalação
acima):

- **`mattpocock-skills`** — fornece `grill-me`/`grill-with-docs` (entrevista o usuário antes de
  gerar a spec, usada pela Fase 1 da `sdd`) e `code-review` (revisão manual após VERIFY).
- **`ponytail`** — fornece `ponytail-review` (job automático `ponytail_review`, revisão focada em
  over-engineering) e `ponytail-debt` (consolidar em ledger os comentários `ponytail:` deixados
  como atalho deliberado, sugerida ao final de uma feature).

Além dessas, uma opcional e não gerenciada por este plugin: skill/MCP de rastreador de issues
(Jira, GitHub Issues etc.), para a `sdd` resolver um ticket por chave ou link.

No Codex, Ponytail é instalado como plugin separado (`ponytail@ponytail`) e Matt Pocock é
instalado como conjunto de skills com `npx skills@latest add mattpocock/skills`; os comandos estão
na seção **Codex CLI**. O manifesto Codex não suporta declarar essas instalações automaticamente.

## Atualizando

**Claude Code:**

```
/plugin marketplace update claude-plugins-official
/plugin marketplace update isabella-a
/plugin update isabella@isabella-a
```

Atualize Ponytail e Matt Pocock separadamente com:
```
/plugin marketplace update claude-plugins-official
/plugin marketplace update ponytail
/plugin update ponytail@ponytail
/plugin update mattpocock-skills@claude-plugins-official
/reload-plugins
```

As duas dependências são atualizadas separadamente porque são plugins instalados em marketplaces
distintos. `claude-plugins-official` normalmente tem atualização automática ativada; marketplaces
de terceiros podem não ter, então os comandos acima tornam a atualização explícita e reproduzível.

#### Automatizar atualização no Claude Code

Não há um comando atômico que atualize `isabella` e todas as dependências em cascata. Para
automatizar, abra `/plugin`, entre em **Marketplaces** e ative **Enable auto-update** para
`isabella-a` e `ponytail` (o `claude-plugins-official` já costuma vir habilitado). O Claude Code
atualiza os marketplaces e seus plugins instalados ao iniciar; quando houver atualização, execute
`/reload-plugins` na sessão atual ou abra uma nova. As dependências declaradas sem versão, como
as deste plugin, acompanham a versão mais recente disponível em seus marketplaces.

**Codex CLI:**
Atualize o marketplace e reinstale o bundle:

```powershell
codex plugin marketplace upgrade isabella-a
codex plugin add isabella@isabella-a
```

Atualize Ponytail separadamente com:
```powershell
codex plugin marketplace upgrade ponytail
codex plugin add ponytail@ponytail
```

Para as skills Matt Pocock instaladas por `skills.sh`, use
`npx skills update`.

Nenhuma das duas ferramentas avisa sozinha quando sai uma versão nova. 
Antes de atualizar, especialmente se a versão mudou de major, veja o:
#### [`CHANGELOG.md`](CHANGELOG.md)


## Estrutura do repositório

```text
.claude-plugin/    # marketplace.json e plugin.json — manifesto do plugin do Claude Code
.agents/plugins/   # marketplace e bundle versionado do plugin do Codex
skills/            # fonte única das skills; sincronizada para o bundle Codex no commit
scripts/           # sincronização do bundle e instalador legado de skills para Codex
spec_harness/      # motor do spec-harness (harness.ts) — não é uma skill, roda em qualquer runtime
hooks/             # hook de enforcement de path usado pelo spec-harness (plugin do Claude Code)
CHANGELOG.md        # histórico de versões do plugin
```
