---
description: Sincroniza as specs de uma feature SDD (.specs/sdd-<feature>/specs/*.md) como Subtarefas do Jira vinculadas a uma história, atribuídas a quem está usando a skill, com 1 ponto cada. Reaproveita subtarefas já existentes quando o escopo bate e cria as que faltarem. Use quando o usuário pedir para "subir as specs para o Jira", "sincronizar as specs com a história X", "criar as tarefas da spec no Jira", ou "vincular as specs à história <chave>". Não usa para Confluence nem para criar a história em si (assume que a história já existe).
name: sdd-jira-sync
---

# SDD → Jira Sync

Sincroniza os arquivos de spec produzidos pela skill `sdd` (`.specs/sdd-<feature>/specs/*.md`)
como **Subtarefas** de uma história do Jira já existente, uma subtarefa por arquivo de spec.

Pré-requisito: este projeto usa a skill `jira-assistant` para configuração (`jira-config.md`
com Project Key, Cloud ID, tipos de issue em PT-BR). Leia esse arquivo antes de tudo — não
duplique a config aqui.

## Quando usar

- "sobe as specs do sdd-<feature> pro Jira, vinculadas na história <CHAVE>"
- "sincroniza as specs com a <CHAVE>"
- "cria as tarefas da spec no Jira" (quando já existe uma pasta `.specs/sdd-*/specs/`)

Não use para criar a história (Epic/História) em si — a skill assume que ela já existe e foi
informada pelo usuário (ou é a única candidata óbvia no diretório `.specs/`).

## Passo a passo

### 1. Resolver a pasta de specs e a história de destino

- Se o usuário não indicar a feature, rode `ls .specs/` e, se houver mais de uma pasta
  `sdd-*`, pergunte qual usar (`AskUserQuestion`).
- **A chave da história é sempre obrigatória.** Se o pedido não trouxer a chave (ex.: o
  usuário só disser "cria as tarefas da spec no Jira" ou "sobe as specs pro Jira"), **pare e
  pergunte qual é a história de destino** (`AskUserQuestion`) antes de ler specs ou tocar no
  Jira — mesmo que só exista uma pasta `.specs/sdd-*` candidata e mesmo que uma spec cite uma
  história em sua documentação. Nunca infira a chave a partir de commits, branch atual ou
  menções soltas dentro dos arquivos de spec.
- Liste os arquivos em `.specs/sdd-<feature>/specs/*.md` — cada um é uma subtarefa candidata.
  Leia o cabeçalho de cada um (`# Spec NN — Título`, seção `## Resumo`, `## Contexto`,
  `## Requisitos Funcionais`, `## Dependências`/`Depende de`) o suficiente para montar um
  resumo fiel — não precisa ler o arquivo inteiro linha a linha se ele for muito grande, mas
  leia sempre `Resumo`, `Contexto`, `Requisitos Funcionais` e `Comportamento Esperado`.

### 2. Ler o estado atual da história no Jira

- `getJiraIssue` da história com `fields: ["summary", "subtasks"]` para listar as subtarefas
  já vinculadas.
- Para cada subtarefa retornada, buscar `summary`/`description` via `searchJiraIssuesUsingJql`
  (`parent = <CHAVE>`) para ter contexto suficiente de comparação.

### 3. Propor o mapeamento e confirmar com o usuário

Antes de mutar qualquer coisa no Jira (ação visível a outras pessoas, ver regra geral de
confirmação antes de ações com blast radius compartilhado):

- Para cada subtarefa já existente, decida se ela **corresponde** a alguma spec atual (pelo
  título e pelo conteúdo, não só por palavras-chave soltas) ou se ficou órfã (spec removida/
  reescrita com escopo diferente).
- Monte uma tabela: `subtarefa existente → spec` para reaproveitar, `spec → nova subtarefa`
  para o que falta.
- Use `AskUserQuestion` apresentando esse mapeamento antes de aplicar qualquer edição/criação.
  Sempre ofereça a opção de ajustar mapeamentos ambíguos manualmente.

### 4. Descobrir o accountId de quem está usando a skill

- Chame `atlassianUserInfo` (ou, se indisponível, `lookupJiraAccountId` pelo e-mail do usuário
  do contexto da sessão) para obter o `accountId` de quem está logado — **não** hardcode um
  accountId de execuções anteriores, o objetivo é atribuir a quem estiver usando a skill agora.

### 5. Descobrir o campo de Story Points dinamicamente

Não hardcode o customfield — o id pode variar entre projetos/instâncias. Para o tipo de issue
"Subtarefa" do projeto, chame `getJiraIssueTypeMetaWithFields` (`requiredFieldsOnly: false`) e
localize o campo cujo `name` é `"Story Points"` (ou `"Story point estimate"` em instâncias em
inglês) — use o `fieldId` retornado (ex.: `customfield_10032`) nas chamadas de `editJiraIssue`.
Se não existir campo de Story Points no projeto, avise o usuário em vez de falhar silenciosamente.

### 6. Editar as subtarefas reaproveitadas

Para cada par `subtarefa existente → spec` confirmado no passo 3, `editJiraIssue` com:

- `summary`: `"Spec NN — <título da spec>"` (mantém rastreabilidade da spec de origem)
- `description`: no template de tarefa padrão do projeto (`## Context` / `## Objective` /
  `## Technical Requirements` / `## Acceptance Criteria` / `## Technical Notes` / `## Estimate`),
  reescrito a partir do Resumo/Contexto/Requisitos Funcionais/Comportamento Esperado da spec —
  não cole a spec inteira, sintetize. Cite as specs das quais depende e que dependem dela em
  "Technical Notes" (ex.: "Depende da spec 03... Consumido pela spec 12...").
- `{<fieldId dos Story Points>: 1}`
- `{"assignee": {"accountId": "<accountId do passo 4>"}}`

### 7. Criar as subtarefas que faltarem

Para cada spec sem correspondente, `createJiraIssue` com `issueTypeName: "Subtarefa"` (ou o
nome PT-BR configurado), `parent: <CHAVE da história>`, mesmo formato de `summary`/`description`
do passo 6. Depois de criada, edite-a para setar Story Points e assignee (a criação não aceita
esses campos diretamente neste MCP — sempre um `editJiraIssue` de acompanhamento).

### 8. Relatar o resultado

Resuma em uma tabela curta: quais subtarefas foram editadas (chave → spec), quais foram criadas
(chave → spec), todas com link (`webUrl` retornado pelas chamadas). Não é necessário relatório
extenso — uma tabela e um parágrafo bastam.

## Regras

- **Sempre confirme o mapeamento antes de mutar** (passo 3) — subtarefas do Jira são estado
  compartilhado, visível a outras pessoas do time.
- **Nunca invente a chave da história ou o nome da feature** — pergunte se não estiver claro.
- **Não hardcode accountId nem customfield_id de Story Points** entre execuções — resolva
  ambos dinamicamente a cada chamada da skill (passos 4 e 5), pois a skill pode ser usada por
  qualquer pessoa do time, em qualquer projeto Jira configurado.
- **Sintetize a descrição, não copie a spec inteira** — o Jira não é o lugar do detalhe técnico
  completo (isso já vive em `.specs/`); a subtarefa é um resumo acionável.
- Siga o template de descrição e as convenções de idioma (PT-BR) já definidas na skill
  `jira-assistant`.
