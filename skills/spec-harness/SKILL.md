---
name: spec-harness
description: Executa specs Markdown produzidas pela skill SDD em qualquer repositório. Um packet unificado por spec, gerado a partir da própria spec, e um único comando (autorun) que encadeia RED→GREEN→VERIFY em subagentes sonnet sem devolver o controle entre as fases. O motor é global (~/.claude/spec_harness) e o perfil (escopos, validadores, comando de teste) vem do .claude/spec_harness/harness.config.json do repo. Use depois que a pasta SDD da feature já existir (.specs/sdd-<feature>/).
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# SDD Spec Harness

Etapa operacional da skill `sdd`, que vem no mesmo plugin: ela quebra a entrega em specs
construíveis, esta aqui as implementa. Não crie uma segunda definição da feature — a spec
Markdown continua sendo a fonte da verdade.

Se a pasta `.specs/sdd-<feature>/` ainda não existir, não improvise um packet: rode `/sdd`
primeiro. E se `.claude/sdd/perfil.md` existir, leia-o — ele descreve as camadas e os padrões do
repositório que os prompts de RED e GREEN vão cobrar.

Ambiente: ative o ambiente do repositório (ver `CLAUDE.md`/`AGENTS.md` dele) antes de qualquer
teste ou lint — o harness herda o ambiente da sessão que o invoca. Em
`dados-one-assistant`, isso é `conda activate one-assistant`.

## Instalação num repositório — você faz, não o usuário

O motor vive em `~/.claude/spec_harness/` e serve todos os repositórios. Do repo são só duas
coisas, versionadas com ele: `.claude/spec_harness/harness.config.json` (o perfil) e o hook
`PreToolUse` em `.claude/settings.json` (sem ele não há enforcement de path dentro dos worktrees).

Quando a skill for usada num repo que ainda não tem perfil, **conclua a instalação você mesmo**,
neste loop:

~~~bash
node ~/.claude/spec_harness/harness.ts init-repo     # detecta e escreve; já roda o doctor no fim
node ~/.claude/spec_harness/harness.ts doctor        # --json para consumir a lista programaticamente
~~~

`init-repo` **detecta** linguagem, extensões, marcadores de teste, comando de teste (lendo
`pytest.ini`/`package.json`/`go.mod` — inclusive `--no-cov` quando o `addopts` já força cobertura),
linter, escopos (subdiretórios do contêiner de domínios: `app/plataformas`, `src/modules`,
`packages`…), `copy_paths` (`.env` que existir) e se a etapa de CRAP tem `radon`/`pytest-cov`
disponíveis. O que ele não infere vira `_pendencias` no próprio JSON, e o `doctor` trata cada
pendência como **ERRO** — ou seja, sai com código 1 enquanto a configuração estiver incompleta.

O `doctor` classifica: **ERRO** impede uma spec de rodar (escopo placeholder ou inexistente,
`{test_paths}`/`{files}` ausentes, binário fora do PATH, hook não registrado, `crap` ligado sem
`radon`, prompt de fase faltando); **AVISO** apenas degrada (nenhum linter, `copy_paths`
inexistente, CRAP desligado).

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
  teste). `.claude/settings.json` é obrigatório e já vem.

Apague cada entrada de `_pendencias` que você resolver e repita o `doctor` até sair limpo. Só
então rode o primeiro `scaffold-packet`.

## O ciclo (três comandos por spec)

~~~bash
node ~/.claude/spec_harness/harness.ts scaffold-packet .specs/sdd-<feature>/specs/NN-<spec>.md
# revise os campos apontados na saída, então:
node ~/.claude/spec_harness/harness.ts autorun .specs/sdd-<feature>/packets/SDD-NN.yaml --no-merge
# revisão semântica (references/verify.md), e só então:
node ~/.claude/spec_harness/harness.ts merge-spec .specs/sdd-<feature>/packets/SDD-NN.yaml
~~~

`autorun` roda **RED → GREEN → VERIFY numa invocação só**. Cada fase é uma sessão headless
própria (sonnet) dentro do worktree da spec; o handoff entre elas é o commit da fase anterior na
branch da spec — determinístico, sem passar por modelo nenhum. Quem orquestra vê uma linha por
tentativa e o resumo final: não vê o código, nem a saída do pytest, nem os logs das sessões.

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
| `app` | escopo único da spec: `assistente`, `batimentos`, `ata_agente`, `faq_backoffice` ou `shared` |
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
suíte completa no CI (`.github/workflows/automated_tests.yaml`), não do gate por spec.

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

## CRAP pós-VERIFY (determinístico, sem modelo)

Antes da revisão automática, o harness roda a suíte do escopo com relatório JSON de cobertura e
pontua CRAP (`complexidade² × (1-cobertura)³ + complexidade`) **só nas funções de produção que a
spec alterou**. Nenhuma sessão de modelo. Artefatos: `crap.json`/`coverage.json` no diretório de
revisão, resumo no campo `crap` da evidência e o top-N injetado no prompt do code review como
`{crap_top}`.

Gate `warn` por padrão (`crap.gate`, `crap.threshold`). É sinal para a revisão, não alvo de
otimização: CRAP cai igual com teste sem `assert`, então nenhum agente recebe "baixe o CRAP" como
tarefa. Detalhes e casos inconclusivos em `references/verify.md#crap-fase-verify-determinístico`.

## Revisão automática pós-VERIFY

Quando a fase VERIFY passa e commita, o harness dispara em paralelo, em sonnet, os jobs de
`post_verify` da config: `code-review-skill` e `cognitive-loop:explain-diff` (que encadeia micro
mundos e o quiz-trava). Artefatos em `.specs/sdd-<feature>/reviews/<NN>/`.

Roda **uma vez por spec**: o marcador `.post-verify.json` no diretório de revisão impede que uma
reverificação (um retry do autorun, um `verify-packet` manual) dispare tudo de novo. Para refazer
de propósito: `node ~/.claude/spec_harness/harness.ts post-verify .specs/sdd-<feature>/packets/.expanded/SDD-NN-verify.yaml`.

`code-review.json` ausente é revisão **inconclusiva**, nunca aprovação. Com
`post_verify.gate: "block"`, um achado `blocking: true` grava `status: review_blocked` e o merge
não acontece. Com `require_quiz_pass: true`, o merge exige o quiz gabaritado
(`.cognitive-loop/quiz/<sha-da-ponta-da-branch>.passed`).

## Revisão semântica e merge

`ready_for_review` significa que os gates mecânicos passaram — não aprovação. Antes de
`merge-spec`, siga `references/verify.md`: confira `manual_review`, leia os artefatos da revisão
automática e troque 🟡 por ✅ na spec nos RF/EC/T efetivamente cobertos.

`autorun` **sem** `--no-merge` mergeia sozinho ao final e apaga a branch/worktree da spec. Use
isso só quando a spec for mecânica o bastante para dispensar leitura antes do merge; caso
contrário, `--no-merge` + `merge-spec`.

## Path scoping

Uma spec toca **um escopo**. Uma mudança que atravessa domínios é mais de uma spec — é a regra
de dependências inviolável do `CLAUDE.md` (`NUNCA: domínio A → domínio B`,
`NUNCA: shared/ → plataformas/`) aplicada ao packet. O hook `PreToolUse` bloqueia leitura e
escrita fora dos paths declarados enquanto a sessão da fase roda, e `verify-packet` recusa
qualquer arquivo alterado fora de `capabilities.write.paths`.

Quando um tipo/DTO serve a mais de um domínio, ele não é redigitado em cada um: vira uma spec
própria escopada em `app/shared/models/**`, e as specs dependentes declaram `Depende de` no
cabeçalho e leem a seção `## Contratos` dela — nunca os arquivos de produção uma da outra.

## Perfil do repositório — `harness.config.json`

Nada de stack está hardcoded no `harness.ts`. A config do repo declara `scopes`,
`source_extensions`, `test_markers` (o que conta como teste nos gates de RED/GREEN),
`validators`, `worktree` (o que copiar para cada worktree — `.env` e `.claude/settings.json`, sem
o qual o hook não roda lá dentro), `implementer` (modelo, tentativas e os prompts de RED e GREEN),
`crap` (comando de cobertura, limiar, gate e alvos de teste por escopo) e `post_verify`.
Caminhos de ferramenta na config (ex.: `crap.tool: tools/crap_calculator.py`) resolvem primeiro
contra o motor global e só depois contra o repo — assim um repo pode sobrescrever uma ferramenta
sem alterar o motor. `SPEC_HARNESS_CONFIG` aponta para outra config, útil para smoke tests.

O que segue é o perfil de `dados-one-assistant`, como exemplo de decisão de gate:

**Por que `typecheck: null`:** `mypy` acusa 352 erros pré-existentes em 42 arquivos e leva mais
de dois minutos — como gate por fase, reprovaria specs por dívida alheia. **Por que
`format: null`:** `app/shared/` tem 17 de 48 arquivos fora do `ruff format`, e tocar um arquivo
legado obrigaria a reformatá-lo inteiro, inflando o diff para além dos Arquivos permitidos.
Ambos viram gate no dia em que a base ficar limpa.

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
  reviews/NN/                      # gerado pela revisão automática
  feedback.md
~~~

Logs das sessões de implementação: `/tmp/spec_harness/logs/<feature>-<NN>/<fase>-<tentativa>.log`.

## Referências

| Etapa | Arquivo |
|---|---|
| Campos do packet e contratos entre specs | `references/task-packets.md` |
| Gates, evidência e revisão semântica | `references/verify.md` |
