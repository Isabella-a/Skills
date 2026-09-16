---
name: qa-tester
description: Gera documentação de QA manual para uma funcionalidade ou uma spec SDD — abre a tela real da aplicação (via Playwright, ou via `claude-in-chrome` quando a tela exige uma sessão logada que só o usuário tem), executa os cenários (caminho feliz + edge cases), tira prints de cada estado relevante e reporta bugs (esperado vs obtido, com print e erros de console). A saída é um relatório em Markdown com checklist de teste manual e prints embutidos, pronto para um colega testar sem precisar ler código. Use quando o usuário pedir "documentação de QA", "gera um checklist de teste manual", "testa essa spec na tela", "roda um teste visual com Playwright", "reporta os bugs dessa funcionalidade" ou passar uma spec de `.specs/sdd-<feature>/specs/` pra validar visualmente. Aceita descrição livre de funcionalidade OU caminho de uma spec SDD — nesse caso lê a seção "Verificação Manual na Tela" da spec, se existir. Não substitui teste automatizado (isso é `spec-harness`/`spec-orchestrator`) nem abre ticket de bug sozinha — cobre a lacuna entre "os testes passam" e "um humano confirmou que funciona na tela".
argument-hint: <descrição da funcionalidade | caminho de 1+ specs .specs/sdd-<feature>/specs/NN-*.md>
allowed-tools: [Read, Glob, Grep, Bash, Write, AskUserQuestion, Skill]
---

# QA Manual com Playwright

Ponte entre "os testes automatizados passam" e "alguém clicou e confirmou que funciona": abre a
tela de verdade, executa os cenários, tira print de cada estado relevante e escreve um relatório
que um colega sem contexto de código consegue seguir para testar manualmente.

O usuário invocou com: **$ARGUMENTS**

> **Avise o usuário logo no início, antes de investigar spec/ambiente:** para o teste ter
> fidelidade real, ele precisa **deixar a aplicação rodando e logada** (ou te passar credencial de
> teste reutilizável) antes de você prosseguir para o Passo 2 — você não consegue logar sozinho
> em telas com auth de nuvem (Cognito/Auth0/SSO) ou que dependem de dado seedado que só ele tem.
> Peça isso já nesta primeira mensagem, não deixe para descobrir no meio do Passo 2.

---

## Pré-requisito

`PROJECT_MAP.md` precisa existir na raiz do repositório — se não existir, rode a skill
`project-map` antes de continuar (`Skill(skill: "project-map")`). Dele você usa:

- **§7 Ambiente local e execução** — comando de start, URL local, serviços que precisam estar de
  pé, variáveis de ambiente.
- **§6 Testes** — se o repositório já tem Playwright configurado (reuse em vez de instalar de
  novo).

---

## Passo 1 — Resolva o escopo do teste

Dois modos de entrada, conforme `$ARGUMENTS`:

**A) Caminho de uma ou mais specs SDD** (`.specs/sdd-<feature>/specs/NN-*.md`): leia o(s)
arquivo(s) inteiro(s). Specs geradas antes da mudança de granularidade do `sdd` (uma por
caso de uso/tela, em vez de agrupadas) costumam precisar ser combinadas: se o usuário passar
mais de uma spec, ou se várias specs do mesmo `implementacao.md` tocam a mesma tela, trate-as
como **um cenário de teste só** — um relatório, uma passagem pelo Playwright, cenários de todas
elas juntos (é o que a tela entrega de verdade, ponta a ponta). Monte os cenários nesta ordem de
prioridade, por spec:

1. Seção `## Comportamento Esperado § Verificação Manual na Tela`, se existir — a spec já vem com
   os passos prontos (specs de frontend de uma entrega vertical geradas pela skill `sdd` trazem
   essa seção).
2. Sem essa seção: derive os cenários de `## Comportamento Esperado` (Fluxo Principal + Fluxos
   Alternativos), cruzando com `## Requisitos Funcionais` (RF `Must`) e `## Edge Cases e
   Tratamento de Erros` (EC `Must`) para o resultado esperado de cada um.
3. A URL/rota da tela sai de `## Contratos` ou de `## Arquivos permitidos`; se não achar, pergunte.

**B) Descrição livre de funcionalidade:** quebre você mesmo em cenários — ao menos um caminho
feliz e um edge case plausível (input inválido, estado vazio, sem permissão), mesmo critério de
qualidade do `sdd` (`regras/qualidade.md`): **nunca invente o resultado esperado**. Se a descrição
não disser o que deve acontecer num cenário (ex.: "o que aparece se o campo X estiver vazio?"),
pergunte via `AskUserQuestion` antes de rodar — um cenário com resultado esperado inventado
invalida o relatório inteiro.

---

## Passo 2 — Decida como acessar a tela

Confirme se a aplicação já responde na URL de `PROJECT_MAP.md § Ambiente local e execução`. Se a
tela exigir login ou dado que você não tem como reproduzir sozinho (auth de nuvem tipo Cognito/
Auth0, banco sem seed, permissão específica), **não tente adivinhar nem subir tudo por conta
própria** — pergunte ao usuário (`AskUserQuestion`) qual das três vias abaixo está disponível,
nesta ordem de preferência (a primeira que der já é fidelidade máxima, sem setup):

1. **Sessão real do usuário, já logada** — ele deixa a aplicação rodando e logada no próprio
   Chrome e te passa a URL. Vá para o **Passo 3a** (`claude-in-chrome`). Zero setup, zero
   credencial na sua mão, CSS/layout/dados 100% reais — prefira sempre que disponível.
2. **Credencial de teste reutilizável por você** (usuário/senha de ambiente de dev, sem ser
   sessão pessoal do usuário) — ele sobe a aplicação (ou já está de pé) e te dá comando + login.
   Vá para o **Passo 3b** (Playwright, você loga sozinho).
3. **Nenhum dos dois** — caia para o **Passo 3c** (harness de componente do próprio repo), com a
   fidelidade visual reduzida que isso implica (ver ressalvas lá).

Se você mesmo subiu a aplicação (via comando do `PROJECT_MAP.md`, cenário 2), guarde isso para
derrubar no Passo 5. Se foi o usuário que deixou rodando (cenário 1), o processo é dele — nunca
derrube.

---

## Passo 3a — Sessão real via `claude-in-chrome` (preferido quando disponível)

Invoque a skill `claude-in-chrome` antes de qualquer chamada `mcp__claude-in-chrome__*` (é a
regra da própria skill). Abra a URL que o usuário passou numa aba nova dentro da sessão dele já
logada, execute cada cenário clicando/preenchendo na tela real, e tire print de cada estado
relevante com a própria ferramenta de screenshot da skill. Mesmas regras de ✅ do Passo 3b
(cenário só é ✅ se o resultado esperado foi confirmado na tela, não só "carregou sem erro").
Não fecha a aba nem a sessão do usuário ao final (Passo 5) — é o navegador dele, não seu.

## Passo 3b — Playwright contra o app rodando

- **Repositório já tem Playwright** (`package.json` com `playwright`/`@playwright/test`, ou
  `playwright.config.*` na raiz): reuse a instalação e a config existentes — não reinstale, não
  crie uma segunda config.
- **Sem Playwright instalado:** rode ad-hoc, sem alterar o `package.json` do repositório-alvo:

  ~~~bash
  npx -y --package=playwright node <script>.mjs
  ~~~

  Primeira execução baixa o Chromium (`npx -y playwright install chromium`, uma vez só) — avise o
  usuário que pode demorar um pouco.

- Escreva o script no diretório de scratchpad da sessão (nunca versionado no repo-alvo). Padrão
  mínimo — adapte as ações de cada cenário, mantenha a captura de erro:

  ~~~js
  import { chromium } from 'playwright';

  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto(URL);
  await page.screenshot({ path: 'screenshots/01-estado-inicial.png', fullPage: true });

  // login com a credencial de teste recebida, se a tela exigir
  // ações do cenário: page.getByRole(...).click(), page.getByLabel(...).fill(...), etc.
  // depois de cada ação relevante, screenshot + assert do resultado esperado

  await browser.close();
  ~~~

## Passo 3c — Fallback: harness de componente do próprio repo

Sem acesso ao app rodando de nenhuma forma (Passos 3a/3b indisponíveis): veja se o repositório já
testa o componente/tela isolado em navegador real sem precisar do app inteiro — Vitest browser
mode (`@vitest/browser` + provider Playwright, `*.spec.tsx` rodando em `chromium`) ou Storybook
com `addon-vitest` são comuns nesse formato. Se existir, reuse o padrão de mock já usado nos
testes daquela tela (dados de fixture, hooks de query mockados) para montar os mesmos cenários.
Escreva o teste temporário fora do que a spec cobre (arquivo `__qa_*__.spec.tsx` ao lado do
componente, por exemplo) e **apague-o ao final do Passo 5** — ele existe só para gerar prints, não
é contribuição ao repositório. **Antes de usar este fallback, confirme que o harness realmente
carrega o CSS/providers reais** (rode um teste de exemplo já existente e confira o print — não
assuma que "tem Storybook" = "funciona"; pode estar quebrado ou incompleto, como qualquer código).

- **Cuidado com fidelidade visual:** um harness de componente puro (Vitest browser mode sem
  Storybook, ou Storybook com CSS/providers não carregados) normalmente não reflete o CSS global
  do app nem o layout da página (sidebar, header) — o print sai funcionalmente correto mas sem
  estilo ou fora do contexto da tela real. Registre isso na seção Cobertura do relatório: qual
  harness foi usado e o que ele não reproduz.
- **Cuidado com UI em portal:** toast, modal ou tooltip que só existe via um provider real (não
  mockado) pode não aparecer no print mesmo com o comportamento confirmado por mock — documente a
  diferença entre "confirmado pela chamada" e "visível no print" no relatório.

---

## Regras comuns aos três (3a/3b/3c)

- Um print por **estado relevante**, não um só por cenário inteiro: antes da ação, depois da ação,
  e sempre que o resultado esperado for verificado.
- Cenário só é ✅ se foi **confirmado** o resultado esperado na tela (locator visível, texto
  certo, contagem certa) — "a página carregou sem erro" não é confirmação de nada.
- Resultado diferente do esperado, ou erro de console/página capturado → é bug: registre print +
  os erros coletados + a diferença exata entre esperado e obtido, e siga para o próximo
  cenário — um bug não interrompe o restante do QA.

---

## Passo 4 — Gere o relatório

Leia `templates/relatorio_qa.md` e preencha. Caminho de saída:

- **Veio de uma spec SDD:** `.specs/sdd-<feature>/qa/<NN>-relatorio.md`, prints em
  `.specs/sdd-<feature>/qa/screenshots/`.
- **Descrição livre:** `.specs/qa-<slug>/relatorio.md`, prints em
  `.specs/qa-<slug>/screenshots/`.

---

## Passo 5 — Encerre

- **3a (`claude-in-chrome`):** não feche a aba nem a sessão do usuário — é o navegador dele.
- **3b (Playwright):** feche o browser (`browser.close()`). Se você mesmo subiu a aplicação no
  Passo 2, derrube o processo ao final — nunca mate um servidor que já estava rodando antes de
  você começar.
- **3c (harness de componente):** apague o(s) arquivo(s) temporário(s) `__qa_*__.spec.tsx` e
  qualquer pasta de print gerada dentro do repositório-alvo — confirme com `git status` que o
  repo voltou ao estado limpo antes de encerrar.

---

## Regras

- Nunca marque ✅ um cenário sem ter rodado de fato no Playwright — sem suposição escrita como se
  fosse resultado real. Incerteza vira pergunta no Passo 1, não invenção no relatório.
- Nunca tire print de dado sensível real (senha, token, PII de produção) — use dado de teste.
- Bug sem print e sem passos de reprodução não entra no relatório.
- Sem bugs encontrados: escreva isso explicitamente na seção "Bugs Encontrados" — não omita a
  seção.
- Esta skill não abre ticket sozinha. Se o usuário quiser transformar um bug encontrado em issue,
  use `jira-assistant` ou `github-assistant` à parte.

## Quando não usar

Funcionalidade sem UI (endpoint puro, job, CLI, mensageria): não há tela para testar visualmente —
o teste automatizado do `spec-harness`/`spec-orchestrator` já cobre esse caso.
