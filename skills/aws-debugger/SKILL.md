---
name: aws-debugger
description: Investiga erros/incidentes da aplicação One Portal (backend NestJS em ECS e frontend Next.js em Amplify) via CloudWatch Logs, alternando entre a conta AWS de develop e a de produção via SSO. Use quando o usuário pedir para investigar um erro em produção/develop, ver logs de um request/pedido específico, "debugar a aplicação na aws", checar por que algo falhou no ambiente, correlacionar um request id, ou entender um incidente reportado por usuário. NÃO use para logs locais (`npm run start:dev`) — só para os ambientes hospedados na AWS.
---

# AWS Debugger — One Portal

Investiga logs de erro do backend (ECS) e frontend (Amplify SSR) do One Portal, nas contas
**develop** e **produção**, via CloudWatch Logs.

## Contas e acesso (SSO)

Duas contas, **mesmo Identity Center**, sessão SSO compartilhada — um único `aws sso login`
cobre os dois profiles (token cacheado até expirar):

| Ambiente | Profile      | Account ID     | Role              |
|----------|--------------|-----------------|-------------------|
| Develop  | `one-dev`    | `851725180415`  | AdministratorAccess |
| Produção | `one-prod`   | `992382483653`  | ReadOnlyAccess    |

Região: **`us-east-1`**.

**Setup inicial (se os profiles não existirem em `~/.aws/config`):**

```ini
[sso-session dev]
sso_start_url = https://identitycenter.amazonaws.com/ssoins-7223fb41b8f7660f
sso_region = us-east-1
sso_registration_scopes = sso:account:access

[profile one-dev]
sso_session = dev
sso_account_id = 851725180415
sso_role_name = AdministratorAccess
region = us-east-1
output = json

[profile one-prod]
sso_session = dev
sso_account_id = 992382483653
sso_role_name = ReadOnlyAccess
region = us-east-1
output = json
```

**Antes de investigar, confirme sessão ativa** (login expira em algumas horas):

```bash
aws sts get-caller-identity --profile one-dev
```

Se der erro de token expirado/inválido, rode `aws sso login --sso-session dev` (abre browser,
um login só reautentica os dois profiles).

**Sempre confirme com o usuário qual ambiente investigar antes de rodar queries** — nunca
assuma prod por padrão. Produção é **ReadOnlyAccess**: qualquer tentativa de ação mutante
falhará por design (é intencional, não um bug de permissão pra reportar).

O `get-caller-identity` mostra o `Arn` com a role assumida de fato — confira ali em vez de
assumir pela tabela acima (a role pode ter sido reconfigurada no Identity Center desde a
última vez que este doc foi atualizado). Se a role aparente não bater com a tabela, não é
bug seu — apenas note e siga (ou avise o usuário se for relevante pra ação que ele pediu).

## Onde estão os logs

### Backend (NestJS em ECS Fargate)

Log group fixo, mesmo nome nas duas contas:

```
/ecs/backend-app
```

### Frontend (Next.js SSR em Amplify)

Log group por app, nomeado pelo **App ID do Amplify** (não pelo nome do app) — o App ID
difere entre dev e prod porque são apps Amplify separados:

```
/aws/amplify/<appId>
```

Descubra o App ID do `portal-one` uma vez por ambiente (raramente muda):

```bash
aws amplify list-apps --profile one-dev  --region us-east-1 --query "apps[?name=='portal-one'].{appId:appId}" --output table
aws amplify list-apps --profile one-prod --region us-east-1 --query "apps[?name=='portal-one'].{appId:appId}" --output table
```

Dentro do log group, os streams seguem `<branch>/<yyyy>/<mm>/<dd>/<uuid>` (branch `develop` em
dev, `main` em prod) — não precisa navegar streams manualmente, o Logs Insights já varre o
log group inteiro.

Builds/deploys do Amplify (não é log de erro de runtime, é histórico de build) ficam em:

```bash
aws amplify list-jobs --app-id <appId> --branch-name <branch> --profile one-dev --region us-east-1 --max-results 5
```

Útil quando o sintoma parece ser "deploy quebrado" em vez de erro em runtime.

## Nota Windows/Git Bash (MSYS)

Log group names começam com `/` (`/ecs/...`, `/aws/amplify/...`). Em Git Bash no Windows, o
MSYS reescreve automaticamente strings que parecem paths Unix, quebrando o parâmetro. `export`
em uma chamada de shell separada pode não persistir (cada comando pode rodar em uma sessão
nova) — prefixe **inline**, só no comando que recebe o parâmetro com `/` (ex.:
`--log-group-name`):

```bash
MSYS_NO_PATHCONV=1 aws logs start-query --log-group-name "/ecs/backend-app" ...
```

## Padrão de log de erro do backend (para montar buscas melhores)

Formato de saída definido em `apps/backend/src/config/logger/index.ts` (winston,
`colorize({ all: true })` — por isso vem com ANSI escapes tipo `[31m`, ignore/strip ao
ler).

Dois formatos de erro coexistem:

1. **Erro de resposta HTTP** (`request-logger.middleware.ts`) — logado só quando o status
   **não é** 200/201/204/304:
   ```
   [<requestId>] [Response] <METHOD> <path> - <status> (<Xms>) - Body: <json>
   ```
   `requestId` é um UUID gerado por request, também aparece na linha `[Request]`
   correspondente (mesmo texto, sem `Body:`) — use pra correlacionar request↔response.

2. **Erro interno do Nest** (`logger.error(msg, context)` em qualquer service) — formatado
   pelo logger nativo do Nest:
   ```
   [Nest] <pid>  - <data/hora> ERROR [<Context>] <mensagem>
   ```
   `<Context>` costuma ser o nome da classe/service que logou (ex.: `PgBoss`,
   `BusinessLeaderApprovesService`).

**Armadilha:** objetos grandes logados (ex.: erro serializado do PgBoss) viram **múltiplas
linhas = múltiplos eventos CloudWatch** (um por linha do `console.log`/objeto multilinha).
Não dá pra tratar como uma única entrada — agrupe eventos por timestamp idêntico/próximo
(mesmo `@timestamp` ou janela de poucos ms) em vez de esperar uma mensagem única e completa.

## Onde salvar resultados de query

Quando precisar persistir `get-query-results` em arquivo (resultado grande, grep depois),
salve no diretório de scratch da sessão — **nunca dentro do repo git**, mesmo que fora de um
diretório rastreado. É fácil digitar um caminho relativo por engano e sujar `git status`; use
sempre um caminho absoluto fora do repo (`/tmp/...` ou o scratchpad da sessão).

## Fluxo de investigação

### 1. Confirme ambiente e período com o usuário

Pergunte (se não tiver ficado claro): dev ou prod? Qual janela de tempo (ou "últimas N
horas")? Tem algo pra ancorar a busca — request id, rota, mensagem de erro, nome de usuário?

Este fluxo é para **investigar o que já aconteceu**, não para tail/follow em tempo real.

**Horário do usuário costuma ser Brasil (BRT, UTC-3), CloudWatch é sempre UTC.** Converta
antes de montar `--start-time`/`--end-time`: BRT + 3h = UTC. Se o usuário disser "a partir
das 22h" sem data, assuma o último 22h BRT que já passou (hoje se ainda não são 22h BRT
agora, senão ontem) — confira a hora atual primeiro:

```bash
date -u +"%Y-%m-%d %H:%M:%S"   # hora atual em UTC, pra você achar o "22h BRT" certo
START=$(date -u -d "2026-07-21 01:00:00" +%s)   # 22h BRT = 01h UTC do dia seguinte
```

Se a conversão de data ficar ambígua (o pedido cobre madrugada, virada de dia, etc.), é
melhor perguntar/confirmar a janela exata em UTC com o usuário do que arriscar errar o dia.

### 2. Rode a query via CloudWatch Logs Insights

Prefira Logs Insights (`start-query` + `get-query-results`) a `filter-log-events` — permite
`parse`, `stats`, ordenação e é mais rápido pra volumes grandes.

```bash
END=$(date +%s)
START=$((END - 6*3600))   # ajuste a janela

QID=$(MSYS_NO_PATHCONV=1 aws logs start-query \
  --profile one-dev --region us-east-1 \
  --log-group-name "/ecs/backend-app" \
  --start-time $START --end-time $END \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | sort @timestamp desc | limit 20' \
  --query 'queryId' --output text)

sleep 5   # query é assíncrona — dê um tempo antes de buscar resultado

aws logs get-query-results --profile one-dev --region us-east-1 --query-id "$QID"
```

Se `status` vier `Running` no resultado, espere mais e repita `get-query-results` (não
precisa recriar a query).

### 3. Refine a busca conforme a pista disponível

- **Por request id (correlacionar request + response + erros no meio):**
  ```
  filter @message like /3f2504e0-4f89-11d3-9a0c-0305e82c3301/
  ```
- **Só respostas HTTP com erro, com status:**
  ```
  filter @message like /\[Response\]/ and @message like /- (4|5)\d\d /
  ```
- **Erro de um service/contexto específico:**
  ```
  filter @message like /ERROR/ and @message like /NomeDoService/
  ```
- **Frontend (Amplify SSR):** mesma sintaxe, trocando `--log-group-name` para
  `/aws/amplify/<appId>`.

**CWLI (a linguagem do Logs Insights) não aceita flags de regex tipo `/i` no fim do
`like` — `like /erro/i` quebra com `MalformedQueryException`.** Pra casar maiúscula/
minúscula, liste as variantes com `or`: `@message like /erro/ or @message like /Erro/`.

**Separe sinal de ruído contando por padrão de erro antes de investigar caso a caso** — um
incidente real costuma aparecer como um pico concentrado numa janela curta, enquanto erros
"de sempre" (retry em cobrança já emitida, validação de payload) se espalham o dia todo.
Rode primeiro uma query de contagem geral:

```
filter @message like /ERROR/ or @message like /Error/ | stats count() as total
```

e, se o total for grande, quebre antes de ler evento por evento — evita gastar a investigação
inteira num erro que é ruído de fundo em vez do incidente que o usuário reportou.

**`parse` pra extrair o contexto (`stats ... by ctx`) costuma falhar em silêncio nesses
logs** — o `colorize` do winston intercala ANSI escapes de formas diferentes entre os dois
formatos de erro (seção acima), então um padrão de `parse` que funciona pra um formato não
casa com o outro, e a query roda sem erro mas devolve um grupo vazio/errado (sem avisar que o
parse não casou nada). Não invista tempo tentando ajustar o padrão de `parse` — é mais rápido
e confiável **buscar os eventos crus ordenados por tempo** (`fields @timestamp, @message |
filter ... | sort @timestamp desc | limit 50`) e agrupar visualmente por trecho da mensagem
ou por `@timestamp` idêntico/próximo, como na seção seguinte.

### 4. Valide a teoria no código antes de concluir

Um log (ou um relato externo, tipo um e-mail de alerta que o usuário colou) descreve um
**sintoma** — a causa só vira conclusão sólida quando você confirma no código-fonte que esse
sintoma é possível e rastreia de onde ele vem. Não feche a investigação só com o texto do log;
os logs deste projeto são grep-áveis (`Grep`/`Read` no repo), então essa validação custa pouco
mais que uma busca.

- **Ache a mensagem de erro literal no código antes de julgar se ela é genuína.** Uma frase de
  erro citada pelo usuário que bate com uma classe de erro real (`throw new XError(msg)`,
  `super(`mensagem`, ...)`) é evidência forte de que veio da aplicação — mesmo que o canal que
  a trouxe (um e-mail, um print) pareça suspeito por outro motivo. O contrário também vale: uma
  frase que não existe em lugar nenhum do código é sinal de que não veio do sistema. Não
  assuma nenhum dos dois lados sem rodar a busca.
- **Rastreie do `throw` até o handler que loga/notifica.** Quem lança o erro, o que captura, e o
  que esse catch faz — loga? dispara e-mail com um template fixo? engole silenciosamente e
  segue? Esse rastro costuma explicar detalhes que o log puro não mostra (por que o corpo do
  e-mail tem exatamente aquele formato, por que só alguns erros viram alerta).
- **Se o usuário contesta sua conclusão com confiança ("tenho certeza que X aconteceu"), não
  insista na mesma busca nem simplesmente aceite sem evidência — amplie o escopo.** Cheque: outra
  conta AWS (você só olhou dev? veja prod também), outro caminho de disparo (endpoint manual,
  webhook de retry, outra instância/replica do serviço), um agendamento que permite mais de uma
  execução por dia. Uma alegação específica do usuário geralmente tem uma explicação real em
  algum lugar do código — vale procurá-la antes de descartar como engano ou de aceitar de
  bandeja.
- **Timing que não bate com o agendamento esperado** (ex.: uma falha seguida de sucesso no mesmo
  dia, quando o job só deveria rodar 1x/dia) costuma indicar um caminho de disparo adicional —
  procure por controllers/webhooks de "run manually", chamadas diretas ao método do job fora do
  cron registrado, ou múltiplas instâncias do serviço competindo pela mesma tarefa.

### 5. Ao achar o erro, monte o contexto ao redor

Um único evento raramente conta a história toda — busque a janela de poucos segundos antes/
depois do timestamp achado (sem `filter`, só `sort` + `limit`) pra ver request de entrada,
efeitos colaterais (consumers pg-boss) e stack trace completo se ele vier multilinha.

**Erro serializado (ex.: `AxiosError` completo) vira dezenas/centenas de linhas de objeto
JS despejado — a maior parte é ruído interno (socket TLS, `Symbol(triggerId)`,
`maxBodyLength`, etc.), não o que causou o erro.** Não leia essas linhas uma a uma: salve o
resultado em arquivo (`get-query-results ... > arquivo.json`) e busque diretamente pelos
campos que importam — `url:`, `hostname:`, `method:`, `status`, `response:`, `data:`. Isso
costuma achar o endpoint/serviço externo culpado em poucas linhas em vez de rolar o dump
inteiro.

**Se o resultado geral vier grande** (a resposta do `get-query-results` for cortada/
persistida em arquivo automaticamente), não tente ler o arquivo inteiro — grep por palavra-
chave (nome do service, `ERROR`, request id) é muito mais rápido que ler tudo.

**Acentos podem vir corrompidos** (`Cobrança` → `Cobran�a`, `emissão` → `emiss�o`) — é
artefato de encoding no pipeline de logs/CLI, não indica corrupção de dado real. Interprete
pelo contexto sem se preocupar em "consertar" o texto.

### 6. Reporte

Resuma: o que falhou, quando, `requestId` (se aplicável), rota/serviço, e a causa aparente a
partir da mensagem — sem inventar causa raiz que os logs não sustentam. Se os logs não forem
suficientes pra concluir, diga isso explicitamente em vez de especular. Deixe claro o nível de
confiança: causa **confirmada no código** (cite arquivo:linha da etapa 4) é diferente de causa
**inferida só pelo texto do log** — não apresente as duas com o mesmo peso.
