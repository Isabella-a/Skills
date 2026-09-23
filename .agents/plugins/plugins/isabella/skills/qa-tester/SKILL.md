---
name: qa-tester
description: Gera documentação de QA manual para uma funcionalidade ou spec SDD. Caminho padrão é testar a tela real com a sessão logada do usuário via controle de navegador (Claude in Chrome no Claude, navegador conectado no ChatGPT/Codex) — verifica ativamente se a extensão/mecanismo está instalado e conectado antes de perguntar, e orienta a instalação se não estiver; sem isso, cai para Playwright. Executa fluxos, registra evidências visuais, erros de console e bugs em relatório Markdown, confirmando persistência real (não só feedback de tela) em cenários de salvar/editar. Use para documentação de QA, checklist manual, teste visual ou validação de tela de uma spec. Não substitui testes automatizados nem abre tickets.
argument-hint: <descrição da funcionalidade | caminho de 1+ specs .specs/sdd-<feature>/specs/NN-*.md>
allowed-tools: [Read, Glob, Grep, Bash, Write, AskUserQuestion, Skill, ToolSearch]
---

# QA Manual no Navegador

Ponte entre "os testes automatizados passam" e "alguém clicou e confirmou que funciona": abre a
tela de verdade, executa os cenários, tira print de cada estado relevante e escreve um relatório
que um colega sem contexto de código consegue seguir para testar manualmente.

O usuário invocou com: **$ARGUMENTS**

> **Avise o usuário logo no início, antes de investigar spec/ambiente** — dois avisos, não só um:
>
> 1. **Ambiente:** para o teste ter fidelidade real, ele precisa **deixar a aplicação rodando e
>    logada** (ou te passar credencial de teste reutilizável) antes de você prosseguir para o Passo
>    2 — você não consegue logar sozinho em telas com auth de nuvem (Cognito/Auth0/SSO) ou que
>    dependem de dado seedado que só ele tem.
> 2. **Navegador (só quando a plataforma atual for o Claude):** o caminho padrão desta skill é
>    controlar o Chrome do próprio usuário via extensão **Claude for Chrome** — não Playwright. Se
>    você ainda não confirmou nesta sessão que a extensão está instalada e conectada, diga que vai
>    checar isso já no Passo 2 e que, se não estiver, vai te guiar pela instalação — é mais rápido
>    avisar agora do que descobrir no meio do Passo 2 e ter que voltar atrás.
>
> Peça o item 1 já nesta primeira mensagem, não deixe para descobrir no meio do Passo 2.

---

## Pré-requisito

`PROJECT_MAP.md` precisa existir na raiz do repositório — se não existir, rode a skill
`project-map` antes de continuar. Invoque a skill quando ela estiver disponível; caso contrário,
leia suas instruções diretamente. Dele você usa:

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
como **um cenário de teste só** — um relatório, uma única passagem de QA no navegador, cenários de todas
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
pergunte ao usuário antes de rodar — um cenário com resultado esperado inventado
invalida o relatório inteiro.

---

## Passo 2 — Decida como acessar a tela

### Passo 2.0 — Verifique primeiro se dá pra controlar o navegador do usuário

Faça esta checagem **antes** de perguntar qual via usar — ela decide se a via 1 (a melhor) é
sequer uma opção. Só se aplica quando a plataforma atual é o Claude; se for ChatGPT/Codex ou outra,
pule para "Sem suporte à extensão nesta plataforma" abaixo.

1. Carregue as ferramentas do navegador numa única chamada `ToolSearch` (elas aparecem como
   *deferred* na listagem de ferramentas disponíveis até serem carregadas — isso é esperado, não é
   sinal de que faltam):

   ~~~
   ToolSearch("select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__list_connected_browsers,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__read_console_messages,mcp__claude-in-chrome__read_network_requests,mcp__claude-in-chrome__javascript_tool")
   ~~~

   Se essas ferramentas não aparecerem nem como *deferred* em nenhuma listagem desta sessão, a
   plataforma atual não suporta Claude in Chrome — pule para "Sem suporte à extensão nesta
   plataforma" abaixo, sem prosseguir para os passos 2/3 seguintes.
2. Chame `list_connected_browsers`. É o teste real de "a extensão está instalada e conectada nesta
   conta", independente do que a spec pedir:
   - **Retornou pelo menos um browser:** siga para o item 3. Se vier mais de um e nenhum estiver
     `inUse`, pergunte ao usuário qual usar (via `AskUserQuestion`, um item por browser — os
     `isLocal`/`onThisComputer` primeiro) e chame `select_browser` com o `deviceId` escolhido.
   - **Lista vazia, ou a ferramenta retorna erro:** a extensão não está instalada ou não está
     conectada nesta conta. Vá para "Instale/conecte a extensão" abaixo — não tente Playwright
     ainda, resolver a extensão é mais rápido e dá fidelidade muito maior.
3. Chame `tabs_context_mcp({createIfEmpty: true})` para confirmar que dá pra abrir uma aba de
   verdade. Retornou um `tabGroupId` com abas disponíveis → controle de navegador está pronto;
   siga para "Depois, confirme com o usuário" abaixo e trate a via 1 como garantida, sem precisar
   perguntar se ela existe (só pergunte se ele *quer* usá-la, caso quisesse deixar isso explícito).

#### Instale/conecte a extensão (oriente o usuário passo a passo, não assuma que ele já sabe)

Diga isso ao usuário e espere ele confirmar antes de tentar de novo:

1. **Instalar** (se `list_connected_browsers` veio vazio e ele não sabe se já tem): abrir a Chrome
   Web Store e buscar por "Claude for Chrome" (extensão oficial da Anthropic), ou seguir o link de
   instalação disponível em claude.ai (área de configurações/conexões) ou na documentação oficial
   do Claude Code — não invente nem monte a URL você mesmo, oriente o usuário a buscar pelo nome
   exato. Pedir para fixar o ícone na barra de extensões do Chrome facilita os próximos passos.
2. **Conectar:** clicar no ícone da extensão, entrar com a mesma conta usada nesta sessão do Claude
   Code/claude.ai, e aceitar a conexão quando solicitado.
3. **Autorizar o site da aplicação:** na primeira vez que o Claude tentar abrir a URL do app sob
   teste, a extensão pode pedir aprovação de site (funciona por permissão por domínio) — o usuário
   precisa clicar em aprovar nesse prompt.
4. Repita o item 2 do Passo 2.0 (`list_connected_browsers`) para confirmar que agora conecta.

Se, mesmo seguindo os passos acima, nenhum browser aparecer conectado (política de empresa
bloqueando extensões, antivírus, etc.) — não insista tentando de novo em loop; volte para "Depois,
confirme com o usuário" e ofereça só as vias 2 (credencial) ou 3 (harness), avisando por quê a via
1 não está disponível.

#### Sem suporte à extensão nesta plataforma

Se as ferramentas `mcp__claude-in-chrome__*` simplesmente não existem nesta plataforma (Codex CLI,
extensão de IDE, ambiente sem MCP de navegador): não peça ao usuário para instalar nada — esse
caminho não existe aqui, instalar a extensão no Chrome dele não mudaria nada. Avise isso em uma
frase e vá direto para "Depois, confirme com o usuário" oferecendo as vias 2/3 (ou, se a
plataforma for ChatGPT/Codex desktop, o navegador conectado equivalente do Passo 3a).

### Depois, confirme com o usuário

Confirme se a aplicação já responde na URL de `PROJECT_MAP.md § Ambiente local e execução`.
**Independente de a tela exigir login ou não**, não tente adivinhar nem subir tudo por conta
própria — pergunte ao usuário qual das três vias abaixo está disponível, nesta ordem de
preferência (a primeira que der já é fidelidade máxima, sem setup, e vale a pena mesmo quando a
tela não exige login: CSS/layout/dados 100% reais é sempre melhor que Playwright headless).
Só pule a pergunta quando o Passo 2.0 já tiver confirmado que o mecanismo de navegador controlado
não existe/não conecta — aí vá direto para o Passo 3b/3c sem perguntar, já que a via 1 já foi
descartada por checagem real, não por suposição:

1. **Sessão real do usuário, já logada** — ele deixa a aplicação rodando e logada no próprio
   navegador e te passa a URL. Vá para o **Passo 3a** (controle de navegador da plataforma).
   Zero setup, zero credencial na sua mão, CSS/layout/dados 100% reais — prefira sempre que
   disponível.
2. **Credencial de teste reutilizável por você** (usuário/senha de ambiente de dev, sem ser
   sessão pessoal do usuário) — ele sobe a aplicação (ou já está de pé) e te dá comando + login.
   Vá para o **Passo 3b** (Playwright, você loga sozinho).
3. **Nenhum dos dois** — caia para o **Passo 3c** (harness de componente do próprio repo), com a
   fidelidade visual reduzida que isso implica (ver ressalvas lá).

Se você mesmo subiu a aplicação (via comando do `PROJECT_MAP.md`, cenário 2), guarde isso para
derrubar no Passo 5. Se foi o usuário que deixou rodando (cenário 1), o processo é dele — nunca
derrube.

---

## Passo 3a — Sessão real pelo navegador conectado (caminho padrão desta skill quando disponível)

Escolha o mecanismo que a plataforma atual disponibiliza; não tente usar uma integração de outra
plataforma:

- **Claude:** ferramentas e conexão já verificadas no Passo 2.0 — não repita a checagem, só use.
  Se por algum motivo chegou aqui sem passar pelo Passo 2.0 (ex.: retomando uma sessão), rode-o
  agora antes de continuar.
- **ChatGPT/Codex no aplicativo desktop:** use o navegador conectado selecionando `@Chrome` (ou
  outro navegador conectado) no chat. Se a tarefa puder usar um perfil isolado, `@Browser` também
  serve; para a sessão já logada do usuário, prefira o navegador conectado. Só use acesso de
  desenvolvedor/CDP para console e rede se ele estiver habilitado e houver aprovação explícita.
- **Codex CLI, extensão de IDE, ou ambiente sem controle de navegador:** este caminho não está
  disponível (já descartado no Passo 2.0). Siga para o Passo 3b com credencial de teste ou para o
  3c.

### Sequência operacional (Claude in Chrome)

1. **Console e rede ligados antes da primeira navegação.** Chame `read_console_messages` e
   `read_network_requests` uma vez cada (mesmo que retornem vazio) antes de navegar para a tela sob
   teste — os dois só capturam eventos a partir da primeira chamada; uma tela que já carregou antes
   perde os erros/requests do load inicial, e você acaba sem poder confirmar "nenhum erro" com
   confiança.
2. **Uma aba por sessão de QA.** Use a aba/`tabGroupId` já aberto no Passo 2.0, ou
   `tabs_context_mcp({createIfEmpty: true})` se começar do zero. Não abra uma aba nova por
   cenário — reaproveite a mesma, navegando entre URLs.
3. **Prefira `browser_batch`** para encadear navegação + clique + espera + print numa chamada só,
   em vez de uma chamada por passo — mais rápido e evita gastar contexto com screenshots
   intermediários que não vão entrar no relatório.
4. **Print de cada estado relevante** com `computer` (`action: "screenshot"`, `save_to_disk: true`)
   para poder copiar o arquivo depois para `.specs/sdd-<feature>/qa/screenshots/` (Passo 4).
5. **Repositório em outro filesystem/ambiente que o desta sessão** (ex.: código dentro do WSL,
   Claude Code rodando no host Windows, ou o inverso; ou um container/VM à parte): acesse os
   arquivos pelo caminho de rede do outro lado (`\\wsl$\<distro>\...` a partir do Windows,
   `/mnt/c/...` a partir do WSL) em vez de tentar rodar comandos do outro SO — `Read`/`Write`/`Bash`
   funcionam normalmente sobre esse caminho. Ainda assim, o comando de start
   (`PROJECT_MAP.md § Ambiente local e execução`) roda no ambiente onde o app de fato vive; a URL
   local (`localhost:<porta>`) costuma atravessar a fronteira host↔WSL sem configuração extra —
   confirme navegando para ela antes de assumir que não atravessa ou que precisa de setup extra.
6. **Ações que enviam dado real** (submeter formulário, clicar em salvar/confirmar/excluir/qualquer
   botão que dispara uma mutação): pergunte ao usuário antes de executar esse clique específico,
   mesmo que o cenário da spec exija — diga qual campo vai editar e que isso gera uma chamada real
   no backend do ambiente dele. Preencher o campo e confirmar que o botão habilita não precisa de
   permissão; só o clique que efetivamente submete/persiste.
7. **Nunca confie só no feedback visual de sucesso** (toast, mensagem, redirect) para marcar ✅ um
   cenário de salvar/editar. Depois do submit, confirme a persistência de verdade: recarregue a
   tela (ou navegue de novo para a mesma URL) e confira se o dado editado continua lá. Se restar
   dúvida se é cache do client (React Query, SWR, Apollo etc.) mascarando o resultado, use
   `javascript_tool` para fazer um `fetch` direto ao endpoint de leitura (mesma origem,
   `credentials: 'include'`) e comparar a resposta crua — é o jeito de diferenciar "a tela mostrou
   sucesso" de "o dado realmente persistiu no backend". Se a resposta direta também mostrar o dado
   antigo, isso é o bug a registrar (com os dois prints: antes/depois do reload, e a chamada feita).
8. A regra de confirmação é a mesma do Passo 3b: só marque ✅ quando o resultado esperado estiver
   confirmado na tela (ou na resposta direta do passo 7), não quando ela apenas carregar.
9. Nunca feche a aba, o navegador ou a sessão do usuário ao final (Passo 5).

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
- Cenário só é ✅ se foi **confirmado** o resultado esperado na tela (elemento visível, texto
  certo, contagem certa) — "a página carregou sem erro" não é confirmação de nada.
- Resultado diferente do esperado, ou erro de console/página capturado → é bug: registre print +
  os erros coletados + a diferença exata entre esperado e obtido, e siga para o próximo
  cenário — um bug não interrompe o restante do QA.
- Registre erros de console quando o mecanismo os expuser. Se o navegador conectado não tiver
  acesso de desenvolvedor aprovado, escreva no relatório que essa coleta não estava disponível;
  não alegue que não houve erros de console.
- Cenário de salvar/editar dado: a confirmação exige persistência real (reload da tela, ou leitura
  direta do endpoint) — feedback de sucesso na hora (toast, redirect) não é suficiente sozinho, ver
  Passo 3a item 7.

---

## Passo 4 — Gere o relatório

Leia `templates/relatorio_qa.md` e preencha. Caminho de saída:

- **Veio de uma spec SDD:** `.specs/sdd-<feature>/qa/<NN>-relatorio.md`, prints em
  `.specs/sdd-<feature>/qa/screenshots/`.
- **Descrição livre:** `.specs/qa-<slug>/relatorio.md`, prints em
  `.specs/qa-<slug>/screenshots/`.

---

## Passo 5 — Encerre

- **3a (navegador conectado):** não feche a aba nem a sessão do usuário — é o navegador dele.
- **3b (Playwright):** feche o browser (`browser.close()`). Se você mesmo subiu a aplicação no
  Passo 2, derrube o processo ao final — nunca mate um servidor que já estava rodando antes de
  você começar.
- **3c (harness de componente):** apague o(s) arquivo(s) temporário(s) `__qa_*__.spec.tsx` e
  qualquer pasta de print gerada dentro do repositório-alvo — confirme com `git status` que o
  repo voltou ao estado limpo antes de encerrar.

---

## Regras

- Nunca marque ✅ um cenário sem tê-lo executado de fato em um dos caminhos dos Passos 3a, 3b ou
  3c — sem suposição escrita como se fosse resultado real. Incerteza vira pergunta no Passo 1,
  não invenção no relatório.
- Nunca tire print de dado sensível real (senha, token, PII de produção) — use dado de teste.
- Bug sem print e sem passos de reprodução não entra no relatório.
- Sem bugs encontrados: escreva isso explicitamente na seção "Bugs Encontrados" — não omita a
  seção.
- Esta skill não abre ticket sozinha. Se o usuário quiser transformar um bug encontrado em issue,
  use `jira-assistant` ou `github-assistant` à parte.

## Quando não usar

Funcionalidade sem UI (endpoint puro, job, CLI, mensageria): não há tela para testar visualmente —
o teste automatizado do `spec-harness`/`spec-orchestrator` já cobre esse caso.
