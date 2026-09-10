---
description: Gerencia GitHub via gh CLI — Pull Requests, Issues e repos/branches. Busca, cria, atualiza, comenta, revisa e faz merge de PRs; cria/atualiza/fecha issues; inspeciona branches, commits e arquivos. Detecta automaticamente o owner/repo do workspace. Use quando o usuário disser "abrir um PR", "criar issue no GitHub", "revisar este pull request", "fazer merge", "listar PRs abertos", "ver os checks", "comparar branches" ou "buscar no repositório". NÃO use para Jira (use jira-assistant) nem Confluence.
name: github-assistant
---

# GitHub Assistant

Especialista em operar o GitHub através do **`gh` CLI**. Cobre três áreas: **Pull Requests**,
**Issues** e **Repositórios & branches**.

## Quando usar

Ative este skill quando o usuário pedir para:

- **PRs:** abrir, listar, ver detalhes/arquivos/diff, comentar, revisar, aprovar, ver status de
  checks/CI ou fazer merge de pull requests.
- **Dependências (Dependabot):** compilar os PRs do dependabot num **pacote de atualização**,
  investigar a doc de cada dependência por breaking changes e rodar os **e2e direcionados**.
- **Issues:** criar, buscar, atualizar, comentar, atribuir ou fechar issues.
- **Repos & branches:** inspecionar branches, commits, arquivos do repositório, comparar
  diffs ou buscar código.

Se a tarefa for sobre Jira, use `jira-assistant`. Se for sobre Confluence, use o assistente de
Confluence.

## Pré-requisitos

Este skill usa o **`gh` CLI**. Confirme que está instalado e autenticado **antes da primeira
operação**:

```bash
gh auth status
```

Se não estiver autenticado, peça ao usuário para rodar `gh auth login` (no Claude Code, sugira
`! gh auth login` para rodar interativamente na sessão). Scopes necessários: `repo` (e
`workflow` para mexer em Actions). Não exponha o token.

## Configuração — detecção de owner/repo

1. **Config do skill primeiro:** procure `github-config.md` (ao lado deste `SKILL.md`).
2. **Se não houver:** detecte pelo git remote do workspace:
   ```bash
   gh repo view --json nameWithOwner,defaultBranchRef -q '.nameWithOwner + " (" + .defaultBranchRef.name + ")"'
   # ou: git remote get-url origin
   ```
3. **Se ainda estiver indefinido:** pergunte ao usuário qual `owner/repo` usar.
4. Guarde `owner/repo` e `defaultBranch` para a conversa.

Dentro do diretório do repo, o `gh` infere `owner/repo` automaticamente — você só precisa passar
`-R owner/repo` para operar **outro** repo que não o do diretório atual.

> Para configurar este skill, edite `github-config.md` na pasta do skill (veja o exemplo lá).

## Regras de uso do `gh` (importante)

- **Prefira `--json` + `--jq`** para leitura — saída estável e parseável, em vez de texto
  formatado para humanos. Ex.: `gh pr view 42 --json state,mergeable,title`.
- **Flags interativas não funcionam** neste ambiente (`-i`, prompts). Passe tudo por flag
  (`--title`, `--body`, `--base`, `--head`). Para corpos longos, use `--body-file` apontando
  para um arquivo temporário em vez de heredoc frágil.
- **Não use `--no-verify`** nem burle hooks/CI do repo.
- **Confirme com o usuário antes de `merge`, `close` ou `pr edit` destrutivo** — ações
  difíceis de reverter; aprovação em um caso não vale para o próximo.

---

## Workflow

### 1. Sempre comece localizando o recurso

Antes de atualizar/comentar/mergear, confirme o número e o estado atual:

```bash
gh pr list --state open --json number,title,headRefName,author
gh issue list --state open --search "author:@me"
gh pr view <n> --json state,mergeable,title,headRefName,baseRefName
```

Use a sintaxe de busca do GitHub com qualificadores (`is:open`, `label:bug`, `author:@me`,
`review-requested:@me`) em `--search`.

### 2. Pull Requests

#### Criar

Criar um PR aqui **não** é só rodar `gh pr create`: o título e o body seguem o padrão do time.
Monte-os a partir do que de fato mudou e do template do repo, nesta ordem:

**1. Confirme a branch base** com o usuário, sugerindo `develop` como padrão (ex.: *"Vou abrir
contra `develop`, ok?"*). Só use outra base (como `main`, para releases) se o usuário pedir.

**2. Monte o título no padrão `[TAG] <descrição do card no Jira>`** — ex.:
`[DEVPO-1069] Criar granularidade de permissionamento`. **O título do PR não usa Conventional
Commits** (isso vale para commits, não para o título do PR).

```bash
branch=$(git rev-parse --abbrev-ref HEAD)
echo "$branch" | grep -oiE 'DEVPO-[0-9]+'        # extrai o tag da branch (ex.: feat/DEVPO-1069-...)
```

- Com o tag em mãos, busque a **descrição do card no Jira** via **`jira-assistant`**
  (`getJiraIssue` com o `cloudId` do `jira-config.md` — projeto DEVPO), campo `summary`. Use esse
  summary como a descrição do título.
- **Se a branch não tiver tag**, ou o Jira não estiver acessível (sem MCP do Atlassian),
  **pergunte ao usuário** o tag e/ou a descrição. Nunca invente o tag.

**3. Introspecte o que mudou** vs a base, para escrever a descrição do PR:

```bash
git fetch origin <base> -q
git log --oneline origin/<base>..HEAD       # commits desta branch
git diff --stat origin/<base>...HEAD        # arquivos/escopo
git diff origin/<base>...HEAD               # detalhe, quando precisar resumir
```

Resuma em PT-BR, objetivo, agrupando por área (backend/frontend/skill…): o **que** mudou e o
**porquê**.

**4. Monte o body a partir do template do repo:**

```bash
cat .github/pull_request_template.md
```

Se existir, ele é a **fonte canônica do body** — preencha-o (não use o template genérico):

| Campo do template | Como preencher |
|-------------------|----------------|
| `## Descrição das alterações` | O resumo da introspecção (passo 3). Remova o comentário `<!-- -->`. |
| **Link da atividade** | Mesmo tag do título: `[DEVPO-XXXX](https://oneinv.atlassian.net/browse/DEVPO-XXXX)`. |
| **Solicitante** | Mantenha como está no template (não altere). |
| **Evidências / Checklist / Mais comentários** | Mantenha em branco / desmarcado para o humano. |

Se o repo **não** tiver `.github/pull_request_template.md`, caia para o template genérico da
seção "Templates" (fallback).

**5. Escreva o body em `/tmp/pr-body.md` e crie o PR:**

```bash
git push -u origin <branch>                 # se a branch ainda não está no remoto

gh pr create \
  --base develop \
  --head <branch> \
  --title "[DEVPO-XXXX] <descrição do card>" \
  --body-file /tmp/pr-body.md
# rascunho: adicione --draft   |   auto-atribuir: --assignee @me
```

- **`--base`** é a branch de destino. **Padrão `develop`; confirme com o usuário.** `main` só
  para releases.
- **`--head`** é a branch com as mudanças (`owner:branch` se vier de fork).

#### Inspecionar / revisar

```bash
gh pr view <n> --json state,mergeable,title,body,headRefName,baseRefName,reviews
gh pr diff <n>                       # diff completo
gh pr view <n> --json files -q '.files[].path'
gh pr checks <n>                     # status de CI/checks
```

Para revisar:

```bash
gh pr review <n> --approve  --body "LGTM"
gh pr review <n> --comment  --body "Comentário geral"
gh pr review <n> --request-changes --body "Ajustes necessários"
```

Para comentários **inline** em linhas específicas (não suportado direto pelo `gh pr review`),
use a API:

```bash
gh api repos/{owner}/{repo}/pulls/<n>/comments -f body="..." -f commit_id="<sha>" -f path="src/x.ts" -F line=10 -f side=RIGHT
```

#### Atuar sobre comentários de um PR (fluxo comum)

Fluxo frequente: um reviewer (humano ou bot, ex.: `gemini-code-assist`) deixou comentários
inline e o usuário pede para "ver o que pode ser feito". Siga esta sequência:

**1. Leia TODOS os comentários inline** (não só o review geral) — eles trazem `path`, `line` e
o `id` necessário para responder:

```bash
# comentários inline (de revisão), com o id de cada um
gh api repos/{owner}/{repo}/pulls/<n>/comments \
  --jq '.[] | {id, path, line, user: .user.login, body}'
# comentários gerais (timeline) + reviews
gh pr view <n> --comments
gh pr view <n> --json reviews -q '.reviews[] | {author: .author.login, state, body}'
```

**2. Vá para a branch do PR** (não trabalhe na branch errada): o `headRefName` em
`gh pr view <n> --json headRefName` é a branch onde as correções entram.

```bash
gh pr view <n> --json headRefName -q .headRefName
git fetch origin <headRefName> -q && git checkout <headRefName>
```

**3. Avalie cada comentário com ceticismo — assuma de início que está equivocado ou é
irrelevante.** Leia o arquivo no ponto indicado e confirme que o problema é real antes de
mexer no código. Bots (ex.: Gemini) erram com frequência: falsos positivos, falta de contexto
do domínio, sugestões que quebram o comportamento esperado.

- **Se o comentário NÃO procede** (equivocado/irrelevante, sem ação necessária): **não altere o
  código — responda** explicando por que não se aplica (passo 6). Não deixe a thread em silêncio.
- **Se o comentário procede:** aplique a correção (passos 4–5).

**4. Valide** — rode lint + type-check (e os testes e2e impactados, quando a mudança tocar
lógica) antes de commitar. Veja o `CLAUDE.md` do app para os comandos.

**5. Commite e faça push** na branch do PR (Conventional Commits; **sem `Co-Authored-By`** —
ver `/CLAUDE.md`). Agrupe um fix por commit quando os achados forem independentes.

**6. Responda cada comentário** (use o `id` do passo 1):

```bash
gh api repos/{owner}/{repo}/pulls/<n>/comments/<comment_id>/replies \
  -f body="<corpo da resposta>"
```

- **Comentário corrigido:** referencie o commit — `Corrigido em <sha> — <resumo da correção>.`
- **Comentário do bot Gemini que você contesta:** comece o corpo com o prefixo **`/gemini`** —
  ex.: `/gemini Este IN não é injeção: os IDs vêm de UUID validado a montante. Por que…?`.
  Isso aciona o Gemini a responder a contestação, permitindo discutir até chegar a um consenso
  antes de qualquer mudança. Use `/gemini` sempre que discordar de um achado do Gemini, em vez
  de simplesmente ignorá-lo.

> Se o usuário só pediu "veja o que pode ser feito", **pare antes do passo 5**: apresente o
> diagnóstico (o que procede, o que não procede e por quê) e só commite/responda quando ele
> confirmar.

#### Atualizar / mergear

```bash
gh pr edit <n> --title "..." --body-file /tmp/pr-body.md --add-label "..."
gh pr ready <n>                      # tira do draft
gh pr merge <n> --squash             # ou --merge / --rebase
```

- **Confirme com o usuário antes de mergear.** Antes, cheque `gh pr checks <n>` (verde) e
  `mergeable` em `gh pr view`.
- Prefira **`--squash`** salvo indicação contrária. Use `--subject "..."` (Conventional
  Commits) para o título do commit de squash; `--delete-branch` se quiser limpar a branch.

### 3. Issues

```bash
gh issue create --title "..." --body-file /tmp/issue-body.md --label "bug" --assignee @me
gh issue list --state open --search "label:bug"
gh issue view <n> --json title,body,state,labels,assignees
gh issue edit <n> --add-label "..." --add-assignee @me --body-file /tmp/issue-body.md
gh issue comment <n> --body "..."
gh issue close <n>                   # confirme antes
```

### 4. Repositórios & branches

```bash
gh repo view --json nameWithOwner,defaultBranchRef,description
gh api repos/{owner}/{repo}/branches --jq '.[].name'
gh api "repos/{owner}/{repo}/contents/<path>?ref=<branch>" --jq '.content' | base64 -d
git log --oneline -n 20 <branch>     # commits locais
gh search code "<termo> repo:{owner}/{repo}"
```

Para comparar branches: `gh api repos/{owner}/{repo}/compare/<base>...<head>` ou
`git diff <base>..<head>` localmente.

### 5. Pacote de atualização de dependências (Dependabot)

Fluxo para **compilar os PRs do dependabot num único pacote**, investigar a doc de cada
dependência e rodar os **e2e direcionados** antes de propor o merge. O dependabot abre PRs
semanais (label `dependencies`, base `develop`, lockfile único na raiz cobrindo backend +
frontend + tooling).

**Gatilho:** "compila os PRs do dependabot", "monta o pacote de atualização de dependências",
"atualiza as dependências da semana".

> Regra de agrupamento deste repo: **patch/minor entram num único PR batch**; **cada major fica
> num PR próprio** (o que o dependabot já abriu), para revisão isolada.

#### 5.1 Levantar e classificar os PRs

```bash
gh pr list --label dependencies --state open \
  --json number,title,headRefName,body,author \
  --jq '.[] | select(.author.login=="app/dependabot")'
```

Para cada PR, parseie o título do dependabot (`chore(deps): bump X from A to B`) e extraia
`pacote`, `de`, `para`. Classifique o **semver** comparando a versão (major ↑ = **major**; só
minor ↑ = **minor**; só patch ↑ = **patch**). Identifique o **app afetado** vendo em qual
`package.json` a dep está declarada (`apps/backend`, `apps/frontend` ou raiz/tooling).

#### 5.2 Investigar a doc de cada dependência (antes de mexer no código)

Para cada pacote — priorizando **minor e major** — use `WebSearch`/`WebFetch` para achar release
notes / CHANGELOG / migration guide entre `de` e `para`. Registre **breaking changes,
deprecations, passos de migração e pontos de atenção**. Esse resumo alimenta o body do PR batch
(5.5) e, em major, o comentário no PR isolado. Patch geralmente dispensa — mas registre se houver
nota de segurança/CVE.

#### 5.3 Montar o pacote (branch batch — só patch/minor)

```bash
git fetch origin develop -q
git checkout -b chore/deps-batch-$(date +%Y-%m-%d) origin/develop
git merge --no-edit origin/<headRefName>     # repita por PR patch/minor incorporado
npm install                                  # na RAIZ — regenera o lockfile único
```

**Majors ficam de fora do batch** — permanecem como os PRs individuais do dependabot.

#### 5.4 Rodar os e2e direcionados (local)

Mapeie os testes que **envolvem a dependência**: `Grep` pelo nome do pacote nos imports do código
do app afetado → ache os módulos que a usam → rode só os `*.e2e-spec.ts` (backend) / specs
(frontend) desses módulos. Se a dep for **transversal** (framework/runtime — ex.: `@nestjs/*`,
`next`, `vitest`), caia para a **suíte completa daquele app**.

- **Backend** (exige Postgres local):
  ```bash
  DB_URL=postgres://postgres:postgres@localhost:5432/oneinvestimento_test \
  AWS_S3_BUCKET_DEFAULT=storage-one-test AWS_REGION=us-east-1 \
  npm run prepare-tests -w @one-portal/backend && \
  npx vitest run --typecheck --config apps/backend/vitest.config.e2e.mts <padrão-dos-módulos>
  ```
- **Frontend** (exige Postgres + backend de pé + browsers Playwright): suba o backend de teste e
  rode `npx playwright test <arquivos>` no workspace do frontend.

> **Se o ambiente local não estiver pronto** (sem Postgres/browsers), **pare e avise o usuário** —
> não silencie a falha nem mergeie. Reporte a saída dos testes fielmente.

#### 5.5 Abrir o PR batch

- Confirme a base **`develop`** com o usuário.
- **Sem card Jira**, o título foge do padrão `[DEVPO-XXXX]` — use Conventional Commits:
  `chore(deps): pacote de atualização de dependências (YYYY-MM-DD)`.
- **Body** a partir de `.github/pull_request_template.md`, com a Descrição contendo uma **tabela**:
  pacote · de→para · semver · app · resultado do e2e · pontos de atenção da doc (5.2) · PR original
  (`#N`). Referencie os PRs incorporados no corpo (`Closes #N`) para fechá-los no merge.
- **Majors:** para cada PR isolado, comente (`gh pr comment <n>`) o resumo de breaking
  changes/migração (5.2), sinalizando que ficou fora do batch e exige atenção.

#### 5.6 Segurança

- **Confirme com o usuário antes de fechar/mergear** qualquer PR.
- **Sem `--no-verify`** e **sem `Co-Authored-By` do modelo** nos commits (ver `/CLAUDE.md`).
- **Não mergeie com e2e vermelho.**

---

## Templates

### PR — título e body

- **Título:** `[TAG] <descrição do card no Jira>` (ex.:
  `[DEVPO-1069] Criar granularidade de permissionamento`). **Não** é Conventional Commits. Veja
  o passo a passo em "Pull Requests → Criar".
- **Body — fonte canônica é `.github/pull_request_template.md` do repo.** Sempre que ele existir,
  preencha-o (Descrição = introspecção do diff; Link da atividade = tag; Solicitante = inalterado;
  Evidências/Checklist = em branco). O template genérico abaixo é **apenas fallback** para repos
  que não têm template próprio.

**Fallback genérico (use só se o repo não tiver `.github/pull_request_template.md`):**

```markdown
## O que muda

[Resumo objetivo da mudança — vindo da introspecção do diff]

## Por quê

[Contexto / motivação / issue relacionada — ex.: "Closes #123"]

## Como testar

- [ ] Passo 1
- [ ] Passo 2

## Notas

[Pontos de atenção para o reviewer, decisões de design, follow-ups]
```

> Use `Closes #N` / `Fixes #N` no corpo para fechar a issue automaticamente no merge.

### Template de Issue (use `--body-file`)

```markdown
## Contexto

[Explicação breve do problema ou necessidade]

## Objetivo

[O que precisa ser feito — alto nível, sem citar arquivos/classes específicos]

## Critérios de aceite

- [ ] Critério 1
- [ ] Critério 2

## Notas técnicas

[Considerações, dependências, links relevantes — sem caminhos de arquivo, que mudam com o tempo]
```

---

## Boas práticas

### ✅ DO

- **Confirme `gh auth status`** antes da primeira operação.
- **Localize o recurso primeiro** (`gh pr list` / `gh issue list`) antes de escrever.
- **`--json` + `--jq`** para leitura; **`--body-file`** para corpos longos.
- **Título de PR no padrão `[TAG] <descrição do card>`** (tag da branch + summary do Jira).
  Commits continuam em **Conventional Commits** (`feat`, `fix`, `chore`, …); o título do PR não.
- **Body de PR a partir do `.github/pull_request_template.md`** do repo, com a Descrição vinda da
  introspecção do diff vs a base.
- **Markdown** nos corpos de PR/issue.
- **Qualificadores do GitHub** em `--search` (`is:`, `label:`, `author:@me`,
  `review-requested:@me`).
- **Vincule issues** nos PRs com `Closes #N`.
- **Ao compilar PRs do dependabot:** investigue a doc da dep (breaking changes/migração) **antes**
  do bump, rode os **e2e direcionados** e mantenha **majors em PRs separados** do batch.
- **Ao atuar sobre comentários de review:** assuma de início que o comentário está equivocado e
  valide antes de mexer no código. Sempre responda a thread (corrigido → cite o `<sha>`; não
  procede → explique o porquê).

### ⚠️ Atenção

- **Nunca commite com `Co-Authored-By` do modelo** nem trailers "Generated with…" (ver
  `/CLAUDE.md`). Commits atribuídos só ao autor humano.
- **Contestar achado do bot Gemini:** responda começando o corpo com **`/gemini`** para acionar
  uma réplica e discutir até consenso — não ignore o comentário em silêncio.

- **Confirme antes de `merge`, `close` ou edição destrutiva.**
- **`<n>` é o número visível na UI** (ex.: `42`), não o ID interno.
- **`--head` de fork** usa `owner:branch`.
- **Flags interativas não funcionam** — passe tudo por flag/`--body-file`.
- **Comentário inline** de review exige a API (`gh api .../pulls/<n>/comments`), não o
  `gh pr review`. **Responder** uma thread inline usa o endpoint `.../comments/<id>/replies`.

---

## Exemplos

### Exemplo 1 — Abrir um PR

```
Usuário: "Abre um PR da branch feat/DEVPO-1069-permission-granularity"

1. gh pr view feat/DEVPO-1069-permission-granularity --json number 2>/dev/null  # já existe PR?
2. confirmar a base com o usuário (padrão: develop)
3. tag = DEVPO-1069 (extraído da branch)
   → jira-assistant: getJiraIssue(cloudId, "DEVPO-1069").summary
                     = "Criar granularidade de permissionamento"
   → título = "[DEVPO-1069] Criar granularidade de permissionamento"
4. introspecção: git fetch origin develop -q
                 git log --oneline origin/develop..HEAD
                 git diff --stat origin/develop...HEAD     # → resumo p/ a Descrição
5. cat .github/pull_request_template.md   # preencher Descrição + Link da atividade (DEVPO-1069)
6. escrever o body preenchido em /tmp/pr-body.md
7. git push -u origin feat/DEVPO-1069-permission-granularity   # se ainda não pushed
8. gh pr create --base develop --head feat/DEVPO-1069-permission-granularity \
     --title "[DEVPO-1069] Criar granularidade de permissionamento" \
     --body-file /tmp/pr-body.md
```

> Se a branch não tivesse tag `DEVPO-XXXX` (ex.: `chore/dev-skills`), pergunte o tag e a
> descrição ao usuário antes de montar o título e o link.

### Exemplo 2 — Revisar um PR

```
Usuário: "Revisa o PR #42"

1. gh pr view 42 --json title,state,body,baseRefName,headRefName
2. gh pr diff 42
3. gh pr checks 42
4. gh pr review 42 --comment --body "Resumo da review: ..."
   # (ou --approve / --request-changes)
```

### Exemplo 3 — Criar uma issue

```
Usuário: "Cria uma issue de bug: o filtro de clientes não persiste ao paginar"

1. escrever /tmp/issue-body.md com o template de issue
2. gh issue create \
     --title "Filtro de clientes não persiste ao paginar" \
     --body-file /tmp/issue-body.md \
     --label "bug"
```

### Exemplo 4 — Fazer merge

```
Usuário: "Faz merge do #42"

1. gh pr checks 42                      # checks verdes?
2. gh pr view 42 --json mergeable,state # mergeable?
3. (confirmar com o usuário)
4. gh pr merge 42 --squash --subject "chore(skills): adiciona github-assistant (#42)"
```

### Exemplo 5 — Atuar sobre comentários de um PR

```
Usuário: "Vê os comentários do PR #33 e o que dá pra fazer na branch dele"

1. gh api repos/{owner}/{repo}/pulls/33/comments \
     --jq '.[] | {id, path, line, user: .user.login, body}'   # lê inline + ids
2. gh pr view 33 --json headRefName -q .headRefName            # branch do PR
   git fetch origin <head> -q && git checkout <head>
3. para cada comentário: assumir que está equivocado → ler o arquivo e validar
   - achado A (gemini): procede   → aplicar fix
   - achado B (gemini): não procede → contestar com /gemini
4. (lint + type-check + e2e impactados)
5. commit (Conventional Commits, SEM Co-Authored-By) + push na branch do PR
6. responder cada thread:
   - corrigido:  gh api .../pulls/33/comments/<idA>/replies \
                   -f body="Corrigido em <sha> — placeholders na cláusula IN."
   - contestado: gh api .../pulls/33/comments/<idB>/replies \
                   -f body="/gemini Não procede: os IDs são UUID validados a montante. …"
```

> Se o usuário só pediu para "ver", pare no passo 3 e apresente o diagnóstico antes de commitar.

### Exemplo 6 — Pacote de atualização do Dependabot

```
Usuário: "Compila os PRs do dependabot num pacote e roda os e2e"

1. gh pr list --label dependencies --state open \
     --json number,title,headRefName,author \
     --jq '.[] | select(.author.login=="app/dependabot")'
   → classificar cada um: pacote, de→para, semver (patch/minor/major), app afetado
2. doc de cada dep (minor/major): WebSearch/WebFetch → CHANGELOG/migration
   → registrar breaking changes / pontos de atenção
3. branch batch (só patch/minor):
     git fetch origin develop -q
     git checkout -b chore/deps-batch-$(date +%Y-%m-%d) origin/develop
     git merge --no-edit origin/<headRef>   # por PR patch/minor
     npm install                            # raiz
   (majors ficam nos PRs individuais do dependabot)
4. e2e direcionados (local): Grep do nome da dep nos imports → módulos afetados
   - backend:  npm run prepare-tests -w @one-portal/backend && \
               npx vitest run --config apps/backend/vitest.config.e2e.mts <padrão>
   - frontend: backend de pé + npx playwright test <arquivos>
   (ambiente local não pronto → parar e avisar)
5. PR batch: chore(deps): pacote de atualização de dependências (YYYY-MM-DD)
   body = tabela (pacote · de→para · semver · app · e2e · atenção · #N) + Closes #N
6. majors: gh pr comment <n> com resumo de breaking changes (deixados fora do batch)
   → confirmar com o usuário antes de fechar/mergear qualquer PR
```

> Patch/minor no batch; **cada major em PR separado**. Não mergeie com e2e vermelho.
