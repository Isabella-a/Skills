---
name: project-map
description: Mapeia um repositório — linguagens, gerenciador de pacotes, frameworks e bibliotecas-chave, arquitetura e estrutura real, estilos/design system (CSS global, tokens), testes, ambiente local, CI/CD e deploy, segurança/configuração, observabilidade, convenções de código observadas, integrações externas e fluxo de trabalho — e grava tudo em `PROJECT_MAP.md` na raiz. É a base de contexto que as outras skills deste plugin (sdd, spec-harness, react-best-practices, nestjs-modular-monolith, monorepo-management) leem antes de agir, para dar conselho e gerar código específico deste repositório em vez de genérico. Use quando o usuário pedir para "mapear o projeto", "documentar a arquitetura", "gerar o PROJECT_MAP.md", "atualizar o mapeamento do repositório", ou quando outra skill verificar que `PROJECT_MAP.md` não existe ou está desatualizado e, com a confirmação do usuário, invocar esta skill primeiro. Aceita `--refresh` para regenerar.
argument-hint: "[--refresh]"
allowed-tools: [Read, Glob, Grep, Bash, Write, AskUserQuestion]
---

# Project Map

Você está construindo a **fonte única de contexto sobre este repositório** — a doc que qualquer
skill deste plugin lê antes de dar conselho ou gerar código, em vez de assumir uma stack genérica
ou perguntar ao usuário o que os arquivos já respondem sozinhos.

O usuário invocou com: **$ARGUMENTS** (`--refresh` força regeneração completa; vazio = gerar se
não existir, ou perguntar antes de regenerar se já existir e parecer desatualizado).

A saída é um único arquivo, `PROJECT_MAP.md`, na **raiz do repositório** — visível, versionado,
útil para humanos (onboarding) e para IA.

---

## Princípio central: evidência, não suposição

Cada afirmação no documento final tem uma origem rastreável (arquivo, comando ou config lido).
"Usa Tailwind" vale se você viu `tailwind.config` ou a classe em uso; "provavelmente usa Tailwind
porque é Next.js" não vale — vira `⚠️ ABERTO:`. Um documento com chutes é pior que não ter
documento: as skills que o consomem vão confiar cegamente no que está escrito.

Não pergunte ao usuário o que os arquivos já respondem. Pergunte **só** o que genuinamente não dá
para inferir, e cap em no máximo 4 perguntas por chamada de `AskUserQuestion` — este mapeamento
deve custar minutos, não uma entrevista longa. O que sobrar sem resposta vira `⚠️ ABERTO:`, não
motivo para travar o fluxo.

---

## Passo 1 — `PROJECT_MAP.md` já existe?

```bash
cat PROJECT_MAP.md 2>/dev/null | head -20
```

- **Não existe:** siga para o Passo 2.
- **Existe e `$ARGUMENTS` não pede `--refresh`:** leia o arquivo inteiro, mostre um resumo de
  5 linhas e pare — não regenere sem pedido explícito. Se foi você mesma quem chamou esta skill a
  partir de outra (ex.: `sdd` verificando o pré-requisito), apenas devolva o conteúdo lido.
- **Existe e `$ARGUMENTS` pede `--refresh`, ou o usuário sinalizou que a estrutura mudou:** releia
  o arquivo antigo primeiro (para não perder correções manuais que ele tenha), depois siga para o
  Passo 2 e regenere, avisando ao final o que mudou.

## Passo 2 — Documentação de agente já existente

É a fonte mais rica e a que o time já mantém — leia antes de escanear qualquer outra coisa:

```bash
ls CLAUDE.md AGENTS.md .cursorrules CONTRIBUTING.md README.md 2>/dev/null
```

Leia cada um que existir, por inteiro. Regras arquiteturais e convenções que já estão lá **não
são copiadas** no `PROJECT_MAP.md` — referencie ("ver CLAUDE.md § Camadas"). Documentação
duplicada diverge; a de origem sempre vence.

## Passo 3 — Detecte monorepo ou projeto único

```bash
ls turbo.json nx.json pnpm-workspace.yaml lerna.json rush.json 2>/dev/null
git ls-files | grep -E '(^|/)(package\.json|pyproject\.toml|go\.mod|Cargo\.toml|composer\.json|Gemfile|pom\.xml)$'
```

Mais de um manifesto em subpastas de primeiro nível (`apps/*`, `packages/*`, `services/*`) com
ferramenta de workspace configurada = monorepo. Isso muda a granularidade das seções 2 e 4 abaixo:
numa monorepo elas viram uma linha por workspace; num projeto único, uma linha só.

## Passo 4 — Escaneie antes de perguntar

Para cada manifesto encontrado (todos, se for monorepo):

1. **Linguagem, runtime e gerenciador de pacotes** — versão declarada no manifesto/lockfile.
2. **Frameworks e bibliotecas-chave**, por categoria — não liste tudo do `package.json`, agrupe
   pelo que uma skill precisaria saber para não sugerir algo incompatível:
   - Framework principal (+ modo: App Router vs Pages Router, monolito vs múltiplos serviços)
   - Camada de dados: ORM/query builder, banco, ferramenta de migration
   - Estado/data-fetching no frontend (TanStack Query, Redux, Zustand, Server Actions, SWR)
   - Validação (Zod, Yup, class-validator, Pydantic)
   - Autenticação/autorização
   - Filas/jobs assíncronos
   - Testes (framework por camada/linguagem)
   - Lint/format/typecheck
3. **Estrutura real**, nunca suposta:
   ```bash
   git ls-files | head -200
   git ls-files | awk -F/ 'NF>1 {print $1"/"$2}' | sort | uniq -c | sort -rn | head -30
   ```
4. **Padrão arquitetural com evidência** — leia 2-3 arquivos representativos de camadas
   diferentes para confirmar a camada real (ex.: um controller, um service, um repository), não
   infira só pelo nome da pasta. Documente também dependências proibidas entre camadas, se
   `CLAUDE.md`/`AGENTS.md` as declarar, e onde vive um contrato compartilhado entre
   camadas/serviços (OpenAPI, GraphQL schema, pacote de tipos), se houver.
5. **Estilos e design system** (só se houver frontend): metodologia (Tailwind, CSS Modules,
   styled-components, vanilla-extract, CSS puro), arquivo(s) de estilo global e o que definem
   (reset, variáveis, fontes), design tokens (cores/espaçamento/tipografia) se houver arquivo de
   tema, suporte a dark mode, biblioteca de componentes (shadcn/ui, MUI, Chakra, Ant Design,
   própria).
6. **Testes**: convenção de nome/local (co-localizado vs árvore separada), níveis existentes
   (unit/integração/e2e) e comando exato para rodar.
7. **Ambiente local e execução**: comando de dev, seed de banco, serviços locais
   (`docker-compose.yml`), variáveis de ambiente necessárias (`.env.example`).
8. **CI/CD e deploy**: `.github/workflows/*`, `.gitlab-ci.yml` — o que precisa passar para um PR
   mergear (lint, typecheck, cobertura mínima); e onde/como o projeto roda em produção
   (serverless, container, edge, VPS) — procure `Dockerfile`, `vercel.json`, manifests de deploy.
9. **Segurança e configuração**: como o repositório gerencia secrets/variáveis de ambiente
   (`.env`, cofre de segredos, `secrets.baseline`), padrão de autenticação/autorização observado.
10. **Observability e feature flags**, se houver: biblioteca de log/tracing/monitoramento
    (Sentry, Datadog, OpenTelemetry), sistema de feature flag (LaunchDarkly, GrowthBook, custom).
11. **Convenções de código observadas** — só o que tiver evidência clara e repetida em pelo menos
    2 arquivos: tratamento de erro, logging, injeção de dependência, nomenclatura. Sem padrão
    claro, não invente — deixe de fora ou marque `⚠️ ABERTO:`.
12. **Integrações externas recorrentes**: grep por SDKs/clients de serviços externos
    (pagamento, e-mail, storage, filas gerenciadas) usados em mais de um lugar.
13. **Fluxo de trabalho**: rastreador de issues (remotes do git, prefixos de chave em
    `git log --oneline -30`), convenção de branch/commit.

## Passo 5 — Pergunte só o que sobrou

Uma chamada de `AskUserQuestion`, no máximo 4 perguntas, só sobre o que o Passo 4 não resolveu.
Mostre o que você já infere e peça confirmação em vez de perguntar do zero.

## Passo 6 — Escreva `PROJECT_MAP.md`

Use `templates/project_map.md`. Regras:

1. **Origem em cada afirmação não óbvia** — "ORM: Prisma (visto em `package.json`)".
2. **Não copie CLAUDE.md/AGENTS.md** — referencie.
3. **Seções sem conteúdo real viram "Não se aplica"** (ex.: Estilos, num backend puro), não uma
   seção vazia ou inventada.
4. **Marque incerto com `⚠️ ABERTO:`**, com o que resolveria a dúvida.
5. **Cabeçalho com data e commit** (`git rev-parse --short HEAD`) — sinal informal de idade do
   documento; nenhuma outra skill precisa validar isso automaticamente, é só para quem for revisar
   saber há quanto tempo o mapeamento foi feito.

Ao terminar, mostre um resumo de 5-8 linhas ao usuário e diga como atualizar: rodar esta skill com
`--refresh`, ou pedir "atualiza o mapeamento do projeto".

## Passo 7 — Versionar

`PROJECT_MAP.md` **deve ser versionado com o repositório** — descreve o projeto, não a máquina.
Se notar que ele não está rastreado, avise o usuário.

---

## Quando outra skill te chama

Se você foi invocada por outra skill (ela detectou `PROJECT_MAP.md` ausente e o usuário
confirmou), rode o fluxo normal acima e, ao final, apenas devolva o conteúdo gerado — quem te
chamou continua o próprio fluxo a partir daí.
