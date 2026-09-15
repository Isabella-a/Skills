---
name: spec-harness
description: Executa specs Markdown produzidas pela skill SDD em qualquer repositório. Um packet unificado por spec e um único comando (autorun) encadeiam RED→GREEN→VERIFY em subagentes Codex CLI ou Claude Code sem devolver o controle entre as fases. O perfil vem de .agents/spec_harness/ (Codex) ou .claude/spec_harness/ (Claude). Use depois que a pasta SDD da feature já existir (.specs/sdd-<feature>/).
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# SDD Spec Harness

Etapa operacional da skill `sdd`, que vem no mesmo plugin: ela quebra a entrega em specs
construíveis, esta aqui as implementa. Não crie uma segunda definição da feature — a spec
Markdown continua sendo a fonte da verdade.

Se a pasta `.specs/sdd-<feature>/` ainda não existir, não improvise um packet: rode `/sdd`
primeiro.

## Runtime: Codex CLI ou Claude Code

O motor (`spec_harness/harness.ts`) é um CLI Node comum. O `autorun` lê
`implementer.runtime` no perfil: `codex` chama `codex exec` para RED/GREEN (padrão em instalações
novas do Codex) e `claude` chama `claude -p` para perfis existentes do Claude Code. Ambos podem
retomar a mesma sessão entre RED e GREEN.

No Codex, cada sessão recebe sandbox `workspace-write` no worktree e o VERIFY rejeita qualquer
arquivo fora das capabilities do packet. No Claude, o hook `PreToolUse` também bloqueia a escrita
antes de ela ocorrer; por isso esse runtime mantém `.claude/settings.json` no worktree.

No Claude Code, use a tool `Skill` para outras skills; no Codex CLI, leia e siga o respectivo
`SKILL.md` instalado em `.agents/skills/`.

## `PROJECT_MAP.md` — leitura escopada, não o arquivo inteiro

Se `PROJECT_MAP.md` existir na raiz do repositório, ele descreve stack, arquitetura, testes e
convenções de código deste repositório, e é o que os prompts de RED/GREEN vão cobrar. Mas ele é
lido de novo em **cada fase de cada spec da feature** — ler
o arquivo inteiro todas essas vezes é o desperdício de token mais fácil de evitar aqui:

1. Leia só a **Seção 0 (índice de leitura por escopo)** e a **Seção 1 (Identidade)** — algumas
   dezenas de linhas, sempre baratas, presentes em qualquer `PROJECT_MAP.md` gerado pela skill
   `project-map`.
2. A partir do `app` do packet (o escopo/domínio da spec) e do que `impl_paths`/`test_paths`
   tocam, decida — usando a tabela da Seção 0 — quais das seções 2-13 essa spec realmente
   precisa. Uma spec de backend puro não precisa de §5 Estilos; uma que não toca pipeline não
   precisa de §8 CI/CD.
3. Leia **só essas seções**: ache a linha de cada `## N.` com `grep -n '^## ' PROJECT_MAP.md` e
   leia o intervalo com `Read(offset=..., limit=...)` até o próximo `## ` — nunca o arquivo
   inteiro por padrão.
4. Reaproveite entre fases da mesma spec: as seções relevantes lidas no `scaffold-packet` não
   precisam ser relidas no RED/GREEN — o que muda entre fases é `context_paths`, não
   `PROJECT_MAP.md`.

Se `PROJECT_MAP.md` não tiver a Seção 0 (gerado antes desta convenção), leia o arquivo inteiro
mesmo, e considere sugerir `project-map --refresh` para ganhar a leitura seletiva daqui em
diante. Se `PROJECT_MAP.md` não existir, pergunte ao usuário se quer gerá-lo agora
(`Skill(skill: "project-map")`) antes de continuar — melhora a precisão dos gates e da revisão.
Se recusar, prossiga só com `harness.config.json`.

### `docs.por_fase` — a mesma ideia para o resto de `docs/`

`PROJECT_MAP.md` cobre stack/arquitetura, mas um repo pode ter outra documentação grande fora
dele (guia de telas, catálogo de domínio, runbook) que o `CLAUDE.md` importa com `@` — nesse caso
ela é reenviada pelo cache em **todo turno** de **cada fase**, e costuma ser o maior item de custo
de uma spec inteira. `docs.por_fase` no `harness.config.json` (ver
`templates/harness.config.template.json § docs`) declara, por fase (`red`/`green`/`verify`),
só os arquivos que aquela fase precisa; o `autorun` injeta essa lista no prompt da sessão como
instrução explícita ("leia só isto"), e o resto de `docs/` fica fora do escopo dela. Opcional e
sem custo quando ausente — preencha só se o repo tiver esse tipo de doc grande.

### Sessão reaproveitada entre fases — o maior corte de custo do autorun

O que a assinatura cobra por sessão é contexto **novo** (`cache_creation_input_tokens` +
`output_tokens`); reler o prefixo já visto é `cache_read`, que não entra nessa conta. Uma sessão
fria paga o piso de contexto (spec, orientação no repo, docs) de novo em CADA fase — é aí que a
maior parte do custo repetido do `autorun` está, não no tamanho de cada turno. Por isso GREEN
retoma a sessão do RED (`--resume`) em vez de abrir uma sessão nova, e cada nova tentativa retoma
a anterior; o prompt de uma retomada (`implementer.prompts.retomada`) é curto de propósito, porque
a sessão já tem tudo isso no contexto. O enforcement não afrouxa: o hook decide pela run **ativa**,
que o harness troca ao entrar em cada fase — o GREEN continua sem conseguir escrever no teste do
RED mesmo compartilhando sessão com ele.

`implementer.lean_context` (padrão ligado) soma a isso descartando MCP e plugins de nível `user`
da sessão da fase — nenhum dos dois serve a um RED/GREEN escopado, e um plugin com hook que falha
em modo headless (sem `/dev/tty`) pode inflar o contexto de cada tool call sem que ninguém perceba.
O hook de path scoping do harness é reinjetado por caminho absoluto, então o enforcement continua
valendo mesmo com o resto do nível `user` fora.

Sem `implementer.prompts.retomada` no perfil, o reaproveitamento se desliga sozinho (AVISO do
`doctor`) e o comportamento volta a ser sessão fria por fase — um repositório configurado antes
deste recurso não quebra. Para desligar de propósito: `reuse_session: false` / `lean_context:
false`. Detalhes e o texto do prompt de retomada em `templates/harness.config.template.json §
implementer`.

Ambiente: ative o ambiente do repositório (venv/conda, nvm, etc. — ver `CLAUDE.md`/`AGENTS.md`
dele) antes de qualquer teste ou lint; o harness herda o ambiente da sessão que o invoca.

## Instalação num repositório — você faz, não o usuário

O motor serve todos os repositórios a partir de uma instalação global. O perfil fica em
`.agents/spec_harness/harness.config.json` para Codex e em
`.claude/spec_harness/harness.config.json` para Claude. Rode `init-repo` no runtime desejado:
`node $HARNESS init-repo --codex` ou `node $HARNESS init-repo --claude`.

Quando a skill for usada num repo que ainda não tem perfil, **conclua a instalação você mesmo**,
neste loop:

~~~bash
node $HARNESS init-repo     # detecta e escreve; já roda o doctor no fim
node $HARNESS doctor        # --json para consumir a lista programaticamente
~~~

`init-repo` **detecta** linguagem, extensões, marcadores de teste, comando de teste (lendo
`pytest.ini`/`package.json`/`go.mod` — inclusive `--no-cov` quando o `addopts` já força cobertura),
 linter, escopos (subdiretórios do contêiner de domínios: `app/plataformas`, `src/modules`,
`packages`…) e `copy_paths` (`.env` que existir). O que ele não infere vira
`_pendencias` no próprio JSON, e o `doctor` trata cada pendência como **ERRO** — ou seja, sai com
código 1 enquanto a configuração estiver incompleta.

O `doctor` classifica: **ERRO** impede uma spec de rodar (escopo placeholder ou inexistente,
`{test_paths}`/`{files}` ausentes, binário fora do PATH, hook não registrado ou prompt de fase
faltando); **AVISO** apenas degrada (nenhum linter ou `copy_paths` inexistente).

Seu trabalho é fechar os ERROs lendo o repositório — `CLAUDE.md`/`AGENTS.md`, `pyproject.toml`,
`package.json`, `Makefile`, workflow de CI — e editando o JSON. O que quase sempre precisa de
julgamento seu:

- **`scopes`** — a detecção acerta quando há um contêiner de domínios; num repo de módulo único
  ela gera um escopo só e marca pendência. Uma spec toca **um** escopo: escolha a divisão que
  reflete as fronteiras reais do repo, não as pastas por acaso.
- **`scaffold.test_command_template`** — precisa conter `{test_paths}` e falhar com código ≠ 0
  quando o teste da fase RED falha (nunca abortar na coleta).
- **`validators`** — o lint que o repo já usa no CI, com `{files}`. Ligue `format`/`typecheck` só
  se a base sustentar como gate por fase; caso contrário `null`, e diga por quê num `_comment`.
- **`worktree.copy_paths`** — o que os testes precisam e não é versionado (`.env`, credenciais de
  teste). No runtime Claude, inclua também `.claude/settings.json`; no Codex, não é necessário.

Apague cada entrada de `_pendencias` que você resolver e repita o `doctor` até sair limpo. Só
então rode o primeiro `scaffold-packet`.

## O ciclo (três comandos por spec)

~~~bash
node $HARNESS scaffold-packet .specs/sdd-<feature>/specs/NN-<spec>.md
# revise os campos apontados na saída, então:
node $HARNESS autorun .specs/sdd-<feature>/packets/SDD-NN.yaml --no-merge
# revisão semântica (references/verify.md), e só então:
node $HARNESS merge-spec .specs/sdd-<feature>/packets/SDD-NN.yaml
~~~

`autorun` roda **RED → GREEN → VERIFY numa invocação só**. RED e GREEN compartilham uma sessão
headless dentro do worktree da spec — GREEN retoma a sessão do RED, e cada nova
tentativa retoma a anterior — em vez de abrir sessão fria por fase (`implementer.reuse_session`,
ver `templates/harness.config.template.json`; desliga sozinho se o repo não tiver
`implementer.prompts.retomada`). VERIFY não abre sessão nenhuma: só roda os validadores do
harness. O que muda entre fases é a fronteira de escrita, imposta pelo hook, não a sessão do
modelo. Quem orquestra vê uma linha por tentativa e o resumo final: não vê o código, nem a saída
do pytest, nem os logs das sessões.

Não leia o diff antes do autorun terminar. O ponto do comando é que as três fases custem uma
única passagem de contexto no orquestrador; abrir os arquivos no meio desfaz exatamente a
economia que ele existe para dar.

Se uma fase reprovar nos gates, o harness devolve os erros à própria sessão daquela fase e
manda tentar de novo (`implementer.max_attempts`, padrão 2). Só depois disso ele para e devolve
o controle — com o worktree intacto, a evidência gravada e nada mergeado.

## O packet unificado

Um YAML por spec, em `.specs/sdd-<feature>/packets/SDD-NN.yaml`. O que muda entre as fases —
o que pode ser escrito, o que a validação espera — é derivado da fase, não escolhido à mão:
`expand-packet` materializa os três packets em `packets/.expanded/` e é lá que a evidência de
cada fase é gravada. Não edite os expandidos.

| Campo | O que é |
|---|---|
| `app` | escopo único da spec, entre os declarados em `scopes` do `harness.config.json` deste repo |
| `test_paths` | o que a fase RED pode escrever |
| `impl_paths` | o que a fase GREEN pode escrever (VERIFY não escreve nada) |
| `context_paths` | leitura extra além da spec, dos testes e da produção — só o necessário |
| `test_command` | o comando de teste da spec, usado nas três fases |
| `red_expects` | `behavior_change` (padrão) ou `new_module` + `missing_module` — ver abaixo |
| `verifies.requirements` | todos os IDs RF/EC/T da spec |
| `phases.<fase>.requirements` | subset de IDs daquela fase, se você quiser recortar |
| `phases.<fase>.extra_commands` / `.artifacts` | validações adicionais por fase |

`scaffold-packet` preenche tudo isso lendo a spec: os IDs das tabelas e os paths da seção
`## Arquivos permitidos` (blocos `**Produção (fase GREEN)**` e `**Testes (fase RED)**`). O que
ele não conseguir inferir sai como `TODO` e o comando falha — nunca como palpite. Se a spec não
tem `## Arquivos permitidos`, é a spec que está incompleta.

## RED em Python — a diferença que quebra o gate

Num projeto TypeScript, um teste RED de módulo inexistente falha como teste. Aqui ele quebra na
**coleta**: `pytest` sai com código 2 e nenhum "failed" na saída — indistinguível de um erro de
import por typo. Por isso o gate de RED é declarado, não "qualquer retorno não zero":

- `red_expects: behavior_change` (o caso comum — a spec muda código existente): exige exit 1 com
  `failed` e **proíbe** `ModuleNotFoundError`/`ImportError`/`SyntaxError` na saída.
- `red_expects: new_module` (todo o código de produção da spec é novo): exige o nome exato do
  módulo ausente (`missing_module`) na saída. O teste tem de importá-lo **dentro do corpo**, o
  que transforma a ausência numa falha de teste normal.

O prompt da fase RED já carrega essa convenção; o campo existe para o gate poder recusar um typo
travestido de RED.

## `--no-cov` não é opcional

O `addopts` do `pytest.ini` inclui `--cov-fail-under=80` medindo `app/` inteiro: qualquer
execução escopada a um arquivo reprova por cobertura mesmo com todos os testes verdes. Por isso
o `test_command` gerado sempre traz `--no-cov -p no:cacheprovider`. A cobertura de verdade é da
suíte completa no CI do repositório, não do gate por spec.

## Quando o autorun para

A saída diz onde: a fase, a evidência, os logs das sessões e o worktree. Leia **a evidência**
primeiro (`.expanded/SDD-NN-<fase>.evidence.json`, campo `errors`) — ela tem o motivo mecânico
exato. Os caminhos possíveis:

- **erro de gate corrigível na spec ou no packet** (path fora do escopo, ID inexistente, comando
  de teste errado): corrija e rode `autorun` de novo — as fases já `ready_for_review` são
  puladas, ele retoma de onde parou.
- **o subagente não deu conta**: entre no worktree, corrija à mão e rode `verify-packet` no
  packet expandido daquela fase; depois `autorun` para seguir.
- **a spec está errada**: pare. Corrigir a spec é decisão sua, não do implementador — e não
  afrouxe `contract`/`forbidden.behaviors` do packet para passar o gate.
- **o log da fase termina com exit 126/127 e uma mensagem curta**: falha de ambiente, não de
  código — o binário do `test_command` não existe dentro do worktree (não versionado nem coberto
  por `worktree.copy_paths`/`link_paths`). O prompt da fase instrui a sessão a parar de imediato
  nesse caso em vez de caçar o arquivo com `find`/`git ls-files`, porque ela não pode consertar a
  montagem do worktree de dentro dele — quem corrige é você, no `harness.config.json`. O `doctor`
  já pega a maioria desses casos antes do autorun (`scaffold.test_command_template`), mas um
  binário adicionado depois do último `doctor` escapa até a próxima checagem.

## Revisão de código

O spec-harness executa somente os gates mecânicos. Depois de concluir e antes do merge, rode a skill code-review-skill sobre o diff e a spec; ela inclui o sinal opcional de CRAP. O harness não cria relatórios nem inicia agentes de revisão.

## Ponytail-debt ao final da feature

Quando todas as specs da feature já estiverem mergeadas, rode a skill `ponytail:ponytail-debt`
sobre o repositório para consolidar num único ledger os comentários `ponytail:` deixados como
atalho deliberado durante alguma fase GREEN — em vez de deixá-los se perder na branch. Peça para
persistir o resultado em `.specs/sdd-<feature>/feedback.md` e revise cada item antes de considerar
a feature encerrada.

## Revisão semântica e merge

`ready_for_review` significa que os gates mecânicos passaram — não aprovação. Antes de
`merge-spec`, siga `references/verify.md`: confira `manual_review`, leia os artefatos da revisão
automática e troque 🟡 por ✅ na spec nos RF/EC/T efetivamente cobertos.

`autorun` **sem** `--no-merge` mergeia sozinho ao final e apaga a branch/worktree da spec. Use
isso só quando a spec for mecânica o bastante para dispensar leitura antes do merge; caso
contrário, `--no-merge` + `merge-spec`.

## Path scoping

Uma spec toca **um escopo**. Uma mudança que atravessa domínios é mais de uma spec — é a regra
de dependências entre camadas do `CLAUDE.md`/`AGENTS.md` do repositório (ex.: `NUNCA: domínio A →
domínio B`) aplicada ao packet. O hook `PreToolUse` bloqueia leitura e escrita fora dos paths
declarados enquanto a sessão da fase roda, e `verify-packet` recusa qualquer arquivo alterado fora
de `capabilities.write.paths`.

Quando um tipo/DTO serve a mais de um domínio, ele não é redigitado em cada um: vira uma spec
própria escopada no escopo `shared` (ver `scopes` do `harness.config.json`), e as specs
dependentes declaram `Depende de` no cabeçalho e leem a seção `## Contratos` dela — nunca os
arquivos de produção uma da outra.

## Perfil do repositório — `harness.config.json`

Nada de stack está hardcoded no `harness.ts`. A config do repo declara `scopes`,
`source_extensions`, `test_markers` (o que conta como teste nos gates de RED/GREEN),
`validators`, `worktree` (o que copiar para cada worktree — `.env` e `.claude/settings.json`, sem
o qual o hook não roda lá dentro), `implementer` (modelo, tentativas e os prompts de RED e GREEN),

`SPEC_HARNESS_CONFIG` aponta para outra config, útil para smoke tests.

Exemplo de critério para decidir um gate: se o type-checker ou o formatter do repositório acusa
um volume grande de erros/divergências pré-existentes (dívida técnica alheia à spec) ou leva tempo
demais para rodar por fase, prefira `null` documentando o motivo num `_comment` — e volte a ligar
o gate quando a base estiver limpa o bastante para não reprovar specs por problemas que elas não
criaram.

A fase VERIFY não tem prompt de implementador de propósito: ela não escreve nada, e seus
validadores são rodados pelo próprio harness — uma sessão ali só gastaria tokens para observar
um resultado já produzido.

## Modo manual (uma fase por invocação)

`open-packet` / `verify-packet` / `run-spec` continuam existindo, sobre os packets expandidos.
Servem para depurar uma fase isolada — não para o fluxo normal, que é justamente o vai-e-vem que
o `autorun` elimina. `run-parallel` roda várias specs sem interseção de paths em worktrees
simultâneos.

## Estrutura

~~~text
.specs/sdd-<feature>/
  descricao_alto_nivel.md
  implementacao.md
  progresso.md
  specs/NN-<spec>.md
  packets/
    SDD-NN.yaml                    # o único packet escrito/revisado por humano
    .expanded/                     # gerado: SDD-NN-{red,green,verify}.yaml + .evidence.json
  feedback.md
~~~

Logs das sessões de implementação: `/tmp/spec_harness/logs/<feature>-<NN>/<fase>-<tentativa>.log`.

## Referências

| Etapa | Arquivo |
|---|---|
| Campos do packet e contratos entre specs | `references/task-packets.md` |
| Gates, evidência e revisão semântica | `references/verify.md` |
