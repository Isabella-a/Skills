# PROJECT_MAP.md

> Gerado pela skill `project-map` em <data>, no commit `<git rev-parse --short HEAD>`. Descreve
> **este repositório** para que as demais skills (sdd, spec-harness, react-best-practices,
> nestjs-modular-monolith, monorepo-management) dêem conselho e gerem código específicos deste
> projeto, em vez de genéricos. Versione este arquivo. Para atualizar: rode a skill `project-map`
> com `--refresh`, ou peça "atualiza o mapeamento do projeto".
>
> Regra de ouro: o que já está no `CLAUDE.md`/`AGENTS.md` não é copiado aqui — é referenciado.

## 0. Índice de leitura por escopo

> **Leia esta seção antes do resto do arquivo.** Ela existe para você não precisar abrir o
> documento inteiro em cada tarefa — leia só as seções que o seu escopo exige.
>
> Para achar a linha de cada seção sem abrir o arquivo inteiro:
> `grep -n '^## ' PROJECT_MAP.md`
> Depois leia só o intervalo da seção que interessa (da linha do `## N.` até a linha do próximo
> `## `) com `Read(offset=<linha>, limit=<até o próximo cabeçalho>)`. Não leia o arquivo inteiro
> só porque uma tarefa precisa de uma seção.

| Seção | Leia quando a tarefa... |
|---|---|
| §1 Identidade & propósito | Sempre — única leitura obrigatória em qualquer tarefa. |
| §2 Stack & runtime | Toca código: precisa saber linguagem, runtime ou gerenciador de pacotes. |
| §3 Frameworks e bibliotecas-chave | Usa ou altera uma camada específica (dados, estado, validação, auth, filas, testes). |
| §4 Arquitetura e estrutura real | Cria/move/localiza um arquivo, ou precisa saber onde algo vive ou qual dependência é proibida. |
| §5 Estilos e design system | Toca frontend/UI. Pule em tarefa 100% backend. |
| §6 Testes | Escreve ou roda teste. |
| §7 Ambiente local e execução | Precisa rodar o projeto localmente ou depende de serviço local (docker-compose etc.). |
| §8 CI/CD e deploy | Toca pipeline, ou precisa saber o que bloqueia um PR. |
| §9 Segurança e configuração | Envolve secret, autenticação/autorização ou configuração sensível. |
| §10 Observability e feature flags | Envolve log, tracing ou feature flag. |
| §11 Convenções de código observadas | Vai escrever código novo — quase sempre relevante antes de codar. |
| §12 Integrações externas recorrentes | Toca um serviço externo (pagamento, e-mail, storage, fila) — confira antes de reimplementar um client. |
| §13 Fluxo de trabalho | Abre PR/branch/issue e precisa da convenção de branch/commit ou do rastreador. |

> **Monorepo:** as tabelas de §2-4 têm uma linha por workspace. Leia só a(s) linha(s) do
> workspace que a tarefa toca — não precisa das linhas dos outros workspaces.
>
> **Seções não se aplicam neste repositório:** <lista gerada no Passo 6, ex.: "§5, §10" — ou
> omita esta linha se todas as seções tiverem conteúdo real>. Pule-as sem abrir.

## 1. Identidade & propósito

- **Projeto:** <nome — o que ele faz, em uma frase>
- **Tipo:** <API | app web | app mobile | CLI | biblioteca | pipeline de dados | infra | monorepo com múltiplos>
- **Domínio:** <o assunto do negócio>
- **Quem consome:** <usuário final, outro serviço, time interno, job agendado>

## 2. Stack & runtime

> Monorepo: uma linha por workspace. Projeto único: uma linha só.

| Workspace | Linguagem/runtime | Gerenciador de pacotes | Origem |
|---|---|---|---|
| <ex.: apps/backend, ou "—" se projeto único> | <ex.: Node 22 / TypeScript 5.6> | <ex.: pnpm> | <manifesto lido> |

**Ferramenta de monorepo:** <Turborepo | Nx | pnpm workspaces | Lerna | não se aplica>

## 3. Frameworks e bibliotecas-chave

| Categoria | Escolha | Versão/modo | Origem |
|---|---|---|---|
| Framework principal | <ex.: Next.js> | <ex.: 15, App Router> | <arquivo> |
| Camada de dados (ORM/query + banco) | <ex.: Prisma + Postgres> | | <arquivo> |
| Migrations | <ferramenta e diretório, ou "não se aplica"> | | <arquivo> |
| Estado/data-fetching (frontend) | <ex.: TanStack Query> | | <arquivo> |
| Validação | <ex.: Zod> | | <arquivo> |
| Autenticação/autorização | <ex.: NextAuth> | | <arquivo> |
| Filas/jobs assíncronos | <ex.: BullMQ, ou "não se aplica"> | | <arquivo> |
| Testes | <framework(s) + comando> | | <manifesto/CI> |
| Lint / format / typecheck | <comandos> | | <config> |

## 4. Arquitetura e estrutura real

Onde o código realmente está (levantado com `git ls-files`, não suposto):

```
<árvore resumida, 2 níveis, só o que importa>
```

**Padrão arquitetural observado** (com evidência — arquivos lidos para confirmar, não só nome de pasta):
<ex.: modular monolith com camadas domain/application/infrastructure/presentation por módulo,
visto em `apps/backend/src/<modulo>/`>

| O que criar | Onde vai |
|---|---|
| <artefato típico 1> | `<caminho>` |
| <artefato típico 2> | `<caminho>` |

**Dependências proibidas:** <ex.: domínio A não importa domínio B. Se estiver no CLAUDE.md, referencie.>

**Contrato compartilhado entre camadas/serviços:** <onde vive — OpenAPI, GraphQL schema, pacote
de tipos compartilhado — ou "não se aplica">

## 5. Estilos e design system

> Só se o projeto tiver frontend. Caso contrário: "Não se aplica — projeto sem frontend."

- **Metodologia:** <Tailwind | CSS Modules | styled-components | vanilla-extract | CSS puro>
- **Estilo global:** <arquivo(s) — ex.: `app/globals.css`> — define <reset, variáveis, fontes>
- **Design tokens:** <cores/espaçamento/tipografia — arquivo de tema, ou "não formalizado">
- **Dark mode:** <suportado (mecanismo) | não suportado>
- **Biblioteca de componentes:** <shadcn/ui | MUI | Chakra | Ant Design | própria | nenhuma>

## 6. Testes

- **Convenção de nome/local:** <ex.: co-localizado, `*.spec.ts` ao lado do arquivo>
- **Níveis existentes:** <unit | integração | e2e — quais e onde>
- **Comando exato:** `<comando>`

## 7. Ambiente local e execução

- **Comando de dev:** `<comando>`
- **Serviços locais necessários:** <docker-compose com quais serviços, ou "nenhum">
- **Seed de dados:** `<comando, ou "não se aplica">`
- **Variáveis de ambiente necessárias:** <ver `.env.example`, ou lista>

## 8. CI/CD e deploy

- **Gates de PR:** <lint, typecheck, testes, cobertura mínima — o que precisa passar para mergear>
- **Onde roda em produção:** <serverless | container | edge | VPS | não determinado>
- **Restrições de runtime relevantes:** <ex.: função Edge sem APIs Node-only, ou "nenhuma conhecida">

## 9. Segurança e configuração

- **Gestão de secrets/env:** <arquivo `.env`, cofre de segredos, variável de CI — como é feita aqui>
- **Padrão de autenticação/autorização:** <ver Stack §3, ou detalhe adicional relevante>

## 10. Observability e feature flags

- **Log/tracing/monitoramento:** <ferramenta, ou "nenhuma detectada">
- **Feature flags:** <sistema usado, ou "nenhum detectado">

## 11. Convenções de código observadas

> Só o que tiver evidência clara e repetida. Sem padrão claro, não invente.

- **Tratamento de erro:** <padrão observado, com exemplo de arquivo>
- **Logging:** <biblioteca/formato>
- **Injeção de dependência:** <mecanismo, se aplicável>
- **Nomenclatura:** <convenção observada>

## 12. Integrações externas recorrentes

| Serviço | Usado para | Onde |
|---|---|---|
| <serviço> | <uso> | <caminho do client/adapter> |

## 13. Fluxo de trabalho

- **Rastreador de issues:** <Jira (projeto/prefixo) | Linear | GitHub Issues | nenhum>
- **Convenção de branch/commit:** <padrão observado no `git log`>

## 14. Em aberto

- ⚠️ ABERTO: <o que não foi possível confirmar e o que resolveria>
