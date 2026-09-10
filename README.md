# Claude Code Skills

Coleção de [Skills](https://docs.claude.com/en/docs/claude-code/skills) genéricas para o
[Claude Code](https://claude.com/claude-code), empacotadas como um **plugin**: instale uma vez e
elas ficam disponíveis automaticamente em **qualquer** repositório da sua máquina — sem precisar
copiar nada projeto a projeto.

Cada skill é reaproveitável por design: nenhuma delas assume convenções, nomes ou estrutura de um
projeto específico. Se você precisa de uma skill amarrada às regras de um repositório em
particular, ela deve viver no `.claude/skills/` daquele repositório, não aqui.

## Pré-requisitos

- [Claude Code](https://claude.com/claude-code) instalado.
- Para usar as skills `sdd` / `spec-harness`: [Node.js](https://nodejs.org) recente (22.6+), com
  suporte nativo à execução de arquivos `.ts`.

## Instalação

Dentro do Claude Code, em qualquer repositório:

```
/plugin marketplace add anthropics/claude-plugins-official
/plugin marketplace add DietrichGebert/ponytail
/plugin marketplace add Isabella-a/Skills
/plugin install claude-skills@isabella-a
```

Não é preciso `git clone` nem rodar nenhum script — o Claude Code busca e mantém o plugin
atualizado sozinho. As duas primeiras marketplaces são de dependências do `spec-harness`
(`mattpocock-skills` e `ponytail` — ver detalhe abaixo); sem elas adicionadas antes, o `/plugin
install` ainda funciona, mas o plugin fica com status "failed to load" até você rodar os dois
primeiros comandos.

### Verificando a instalação

```
/plugin
```

Abra a lista de plugins instalados e confirme `claude-skills`. Ou digite `/` em qualquer
repositório para ver as skills na lista de comandos, ou simplesmente descreva a tarefa em
linguagem natural — o Claude reconhece o pedido e ativa a skill certa sozinho.

## Skills disponíveis

A maioria das skills abaixo é genérica, no espírito descrito acima. Duas exceções —
`aws-debugger` e `code-review-skill` — foram trazidas de um monorepo específico (infraestrutura
AWS e stack de código daquele projeto) e estão marcadas como tal na tabela; use-as como
referência, não como padrão a copiar para outro repo.

**Comece por `project-map`.** As outras quatro skills deste plugin dão conselho genérico até
saberem em que repositório estão — `project-map` é o que muda isso. Rode uma vez por repositório
(as outras skills verificam sozinhas se falta e perguntam antes de gerar) e o resultado
(`PROJECT_MAP.md`) é o que faz `react-best-practices` sugerir a lib de estado que o projeto já
usa em vez de uma genérica, `nestjs-modular-monolith` respeitar o ORM já escolhido, e `sdd`/
`spec-harness` gerarem specs e código no padrão real do repositório em vez de inventar um.

| Skill | O que faz | Como acionar |
|---|---|---|
| [`project-map`](skills/project-map) | Mapeia o repositório (linguagens, bibliotecas, arquitetura, estilos/CSS global, testes, CI/deploy, segurança, observabilidade) e gera `PROJECT_MAP.md` na raiz — a base de contexto que as demais skills leem antes de agir. | Peça "mapeia esse projeto" ou "gera o PROJECT_MAP.md". As outras skills também oferecem rodá-la sozinhas quando notam que falta. |
| [`nestjs-modular-monolith`](skills/nestjs-modular-monolith) | Referência para desenhar módulos NestJS como monolito modular (DDD, Clean Architecture, CQRS). | Ativa ao mencionar "modular monolith", "bounded contexts", "CQRS" ou ao desenhar módulos de domínio em NestJS. |
| [`react-best-practices`](skills/react-best-practices) | Boas práticas de performance para React/Next.js (Vercel Engineering) — data fetching, bundle, renderização. | Ativa ao escrever, revisar ou refatorar componentes React/Next.js. |
| [`monorepo-management`](skills/monorepo-management) | Referência geral de gestão de monorepos com Turborepo, Nx e pnpm workspaces. | Ativa ao configurar um monorepo, otimizar builds ou gerenciar dependências compartilhadas. |
| [`sdd`](skills/sdd) | Quebra uma entrega em specs construíveis — documentos de Spec-Driven Design, um por unidade testável, antes de qualquer código. | `/sdd <descrição da feature>`, `/sdd ABC-1234` (busca o ticket antes) ou peça "escreve um spec para X". |
| [`spec-harness`](skills/spec-harness) | Implementa cada spec gerada pela `sdd` em RED→GREEN→VERIFY, num git worktree isolado, com enforcement de path e revisão automática. | Automática, depois que a pasta `.specs/sdd-<feature>/` já existir. |
| [`sdd-jira-sync`](skills/sdd-jira-sync) | Sincroniza as specs de uma feature `sdd` (`.specs/sdd-<feature>/specs/*.md`) como Subtarefas de uma história já existente no Jira — reaproveita subtarefas que já batem com o escopo e cria as que faltarem. | Peça "sobe as specs do sdd-<feature> pro Jira, vinculadas na história <CHAVE>" ou "sincroniza as specs com a <CHAVE>". Depende da skill `jira-assistant` para configuração. |
| [`github-assistant`](skills/github-assistant) | Gerencia GitHub via `gh` CLI — Pull Requests, Issues, branches e commits. Detecta automaticamente o owner/repo do workspace (`github-config.md` ou git remote). | Peça para abrir/revisar/mergear um PR, criar uma issue, listar PRs abertos, ver checks de CI ou comparar branches. |
| [`jira-assistant`](skills/jira-assistant) | Gerencia issues do Jira via Atlassian MCP — busca, cria, atualiza, transiciona status, comentários e KTLOs. Detecta a configuração do workspace automaticamente (`jira-config.md`). | Peça para criar/buscar/atualizar uma issue, mover para outro status, comentar ou "cadastrar um KTLO". |
| [`aws-debugger`](skills/aws-debugger) ⚠️ | Investiga erros/incidentes do One Portal (backend NestJS em ECS, frontend Next.js em Amplify) via CloudWatch Logs, alternando entre as contas AWS de develop e produção via SSO. | Peça para investigar um erro em produção/develop ou ver logs de um request específico. **Específica da infraestrutura do One Portal.** |
| [`code-review-skill`](skills/code-review-skill) ⚠️ | Revisão de código com o checklist e as convenções do stack do One Portal (NestJS 11 com Either/Unit of Work/pg-boss, React 19 + Next.js 16, TanStack Query v5). | Ativa ao revisar PRs/mudanças nesse stack. **Específica do One Portal** — para revisão genérica use a `code-review` do plugin `mattpocock-skills`. |

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
`claude-skills` desde que as marketplaces delas já tenham sido adicionadas (ver Instalação
acima):

- **`mattpocock-skills`** — fornece `grilling` (entrevista o usuário antes de gerar a spec, usada
  pela Fase 1 da `sdd`) e `code-review` (job automático `code_review` do `spec-harness` pós-VERIFY).
- **`ponytail`** — fornece `ponytail-review` (job automático `ponytail_review`, revisão focada em
  over-engineering) e `ponytail-debt` (consolidar em ledger os comentários `ponytail:` deixados
  como atalho deliberado, sugerida ao final de uma feature).

Além dessas, uma opcional e não gerenciada por este plugin: skill/MCP de rastreador de issues
(Jira, GitHub Issues etc.), para a `sdd` resolver um ticket por chave ou link.

## Atualizando

```
/plugin marketplace update isabella-a
/plugin update claude-skills@isabella-a
```

O Claude Code não avisa sozinho quando sai uma versão nova — ele só atualiza quando você roda os
comandos acima. Antes de atualizar, especialmente se a versão mudou de major, veja o
[`CHANGELOG.md`](CHANGELOG.md).

## Estrutura do repositório

```text
.claude-plugin/    # marketplace.json e plugin.json — manifesto do plugin
skills/            # uma pasta por skill, com SKILL.md na raiz de cada uma
spec_harness/      # motor do spec-harness (harness.ts) — não é uma skill
hooks/             # hook de enforcement de path usado pelo spec-harness
CHANGELOG.md        # histórico de versões do plugin
```
