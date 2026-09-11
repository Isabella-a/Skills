---
name: spec-harness
description: Executa specs Markdown produzidas pela skill SDD em qualquer repositório. Um packet unificado por spec, gerado a partir da própria spec, e um único comando (autorun) que encadeia RED→GREEN→VERIFY em subagentes sonnet sem devolver o controle entre as fases. O motor é global — instalado como plugin do Claude Code ou manualmente em ~/.claude/spec_harness — e o perfil (escopos, validadores, comando de teste) vem do .claude/spec_harness/harness.config.json do repo. Use depois que a pasta SDD da feature já existir (.specs/sdd-<feature>/).
allowed-tools: [Read, Glob, Grep, Bash, Write, Edit]
---

# SDD Spec Harness

Etapa operacional da skill `sdd`, que vem no mesmo plugin: ela quebra a entrega em specs
construíveis, esta aqui as implementa. Não crie uma segunda definição da feature — a spec
Markdown continua sendo a fonte da verdade.

Se a pasta `.specs/sdd-<feature>/` ainda não existir, não improvise um packet: rode `/sdd`
primeiro.

## `PROJECT_MAP.md` — leitura escopada, não o arquivo inteiro

Se `PROJECT_MAP.md` existir na raiz do repositório, ele descreve stack, arquitetura, testes e
convenções de código deste repositório, e é o que os prompts de RED/GREEN e o job `code_review`
do pós-VERIFY vão cobrar. Mas ele é lido de novo em **cada fase de cada spec da feature** — ler
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

Ambiente: ative o ambiente do repositório (venv/conda, nvm, etc. — ver `CLAUDE.md`/`AGENTS.md`
dele) antes de qualquer teste ou lint; o harness herda o ambiente da sessão que o invoca.

## Instalação num repositório — você faz, não o usuário

O motor serve todos os repositórios a partir de uma instalação global — como plugin do Claude
Code (`$CLAUDE_PLUGIN_ROOT/spec_harness/harness.ts`) ou instalado manualmente em
`~/.claude/spec_harness/harness.ts`. Antes de rodar qualquer comando abaixo, resolva qual dos dois
se aplica (teste se a variável de ambiente `CLAUDE_PLUGIN_ROOT` está definida) e use esse caminho —
os exemplos abaixo chamam esse arquivo de `$HARNESS`. Do repo são só duas coisas, versionadas com
ele: `.claude/spec_harness/harness.config.json` (o perfil) e o hook `PreToolUse` em
`.claude/settings.json` (sem ele não há enforcement de path dentro dos worktrees — quando o motor
está instalado como plugin, esse hook já vem do próprio plugin e não precisa ser registrado aqui).

Quando a skill for usada num repo que ainda não tem perfil, **conclua a instalação você mesmo**,
neste loop:

~~~bash
node $HARNESS init-repo     # detecta e escreve; já roda o doctor no fim
node $HARNESS doctor        # --json para consumir a lista programaticamente
~~~

`init-repo` **detecta** linguagem, extensões, marcadores de teste, comando de teste (lendo
`pytest.ini`/`package.json`/`go.mod` — inclusive `--no-cov` quando o `addopts` já força cobertura),
linter, escopos (subdiretórios do contêiner de domínios: `app/plataformas`, `src/modules`,
`packages`…), `copy_paths` (`.env` que existir) e se a etapa de CRAP tem o que precisa. Node é o
runtime padrão de CRAP (`eslintcc`); Python é a alternativa (`radon`/`pytest-cov`), ligada só se
o repositório for detectado como Python. Para Node, `init-repo` prefere o comando de teste já
confirmado em `PROJECT_MAP.md § Testes` (skill `project-map`) — sinal mais forte, porque veio de
evidência real — e só cai para adivinhar por `vitest`/`jest`/`nyc` em `package.json` se
`PROJECT_MAP.md` não existir ou não mencionar um runner conhecido. O que ele não infere vira
`_pendencias` no próprio JSON, e o `doctor` trata cada pendência como **ERRO** — ou seja, sai com
código 1 enquanto a configuração estiver incompleta.

O `doctor` classifica: **ERRO** impede uma spec de rodar (escopo placeholder ou inexistente,
`{test_paths}`/`{files}` ausentes, binário fora do PATH, hook não registrado, `crap` ligado sem
`eslintcc` (Node, padrão) ou `radon` (Python, `crap.runtime: "python"`), prompt de fase faltando);
**AVISO** apenas degrada (nenhum linter, `copy_paths` inexistente, CRAP desligado).

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
node $HARNESS scaffold-packet .specs/sdd-<feature>/specs/NN-<spec>.md
# revise os campos apontados na saída, então:
node $HARNESS autorun .specs/sdd-<feature>/packets/SDD-NN.yaml --no-merge
# revisão semântica (references/verify.md), e só então:
node $HARNESS merge-spec .specs/sdd-<feature>/packets/SDD-NN.yaml
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

## Revisão automática — por FEATURE, não por spec

A revisão automática **não roda a cada VERIFY**. Ela é cara (uma sessão sonnet completa, lendo
diff+specs do zero) e repeti-la a cada spec era o maior custo de token repetido do `autorun`. Em
vez disso, rode **uma vez por feature**, depois que todas as specs já estiverem mergeadas na
branch de trabalho:

~~~bash
node $HARNESS review-feature <feature-slug> --base <ref-onde-a-feature-começou>
~~~

`--base` é obrigatório e explícito — o harness não adivinha onde a feature divergiu (ex.: a
branch default do repo, ou o commit anterior à primeira spec). `--branch` (padrão: branch atual)
e `--force` (ignora o marcador de já-executado) são opcionais.

### CRAP — preparação da revisão, não gate do VERIFY

Antes de abrir a sessão de revisão, `review-feature` roda CRAP (determinístico, sem modelo)
**sobre o diff acumulado da feature** (`base...branch`), por escopo tocado: suíte de teste do
escopo com relatório de cobertura, pontuando CRAP (`complexidade² × (1-cobertura)³ + complexidade`)
só nas funções de PRODUÇÃO alteradas. Isso não é mais um gate mecânico do VERIFY — é insumo para
a skill de code review, injetado no prompt como `{crap_top}`. Artefatos: `crap.json`/
`crap-arquivos.txt` em `.specs/sdd-<feature>/reviews/feature/`.

Gate `warn` por padrão (`crap.gate`, `crap.threshold`). Como isso roda **depois** de todas as
specs já mergeadas, `crap.gate: "block"` não impede merge nenhum — só faz `review-feature` sair
com exit 1, como sinal para quem orquestra. É sinal para a revisão, não alvo de otimização: CRAP
cai igual com teste sem `assert`, então nenhum agente recebe "baixe o CRAP" como tarefa. Detalhes
em `references/verify.md § CRAP`.

`crap.runtime` escolhe a ferramenta, não a stack: `"node"` (**padrão**, `tools/crap_calculator.ts`,
usa `eslintcc` — a regra `complexity` do próprio ESLint — sobre um relatório de cobertura
Istanbul) ou `"python"` (`tools/crap_calculator.py`, usa `radon`+`pytest-cov`). `init-repo`
escolhe sozinho ao detectar a linguagem; ambas produzem o mesmo shape de evidência.

### Os jobs de revisão

O template deste plugin vem com **um job** (`code_review`), que faz duas passadas na mesma
sessão sobre o mesmo diff — evita abrir uma segunda sessão só para reler o que a primeira já leu:

- **Passada 1** (skill `code-review-skill`) — revisão geral contra CLAUDE.md/AGENTS.md, bugs e o
  sinal de CRAP.
- **Passada 2** (`ponytail:ponytail-review`) — focada só em over-engineering (dependência
  desnecessária, abstração especulativa, flexibilidade morta).

**Atenção:** `code-review-skill` **não** é dependência deste plugin (`claude-skills`) — é uma
skill de stack específico (ver README) que precisa estar instalada separadamente no ambiente que
roda `review-feature`. Sem ela, troque a Passada 1 de volta para `mattpocock-skills:code-review`
(genérica, essa sim dependência garantida do plugin) no `harness.config.json` do repositório.
`ponytail` (Passada 2) continua sendo dependência garantida do plugin, instalada junto com ele.

Artefatos em `.specs/sdd-<feature>/reviews/feature/`.

O job `cognitive_loop` (explicador + micro-mundo interativo + quiz-trava) saiu do template
padrão: é a sessão mais cara de todo o fluxo (repo-grounding integral + geração de artefato
interativo), incondicional, e a maioria dos times não usa o resultado. Continua disponível como
skill (`cognitive-loop:explain-diff`) para rodar manualmente quando quiser; para religar como job
automático, adicione-o de volta a `post_verify.jobs` adaptando `{spec}`/`{num}` para `{feature}`.

Roda **uma vez por head** da feature: o marcador `.post-verify.json` em `reviews/feature/`
impede reexecução no mesmo `head_sha`; `--force` refaz. Como isso acontece **depois** de todas
as specs já mergeadas, `post_verify.gate: "block"` não bloqueia merge nenhum — só faz
`review-feature` sair com exit 1, como sinal para quem orquestra. `require_quiz_pass` fica sem
efeito com o template padrão (nenhum job produz a trava do quiz).

Para revisar **uma spec isolada** manualmente (fora do fluxo padrão, ex.: uma spec
particularmente arriscada que você quer olhar antes das outras mergearem):
`node $HARNESS post-verify .specs/sdd-<feature>/packets/.expanded/SDD-NN-verify.yaml` — usa os
mesmos jobs, mas sobre o diff só dessa spec, em `reviews/<NN>/`.

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
`crap` (comando de cobertura, limiar, gate e alvos de teste por escopo) e `post_verify`.
Caminhos de ferramenta na config (ex.: `crap.tool: tools/crap_calculator.py`) resolvem primeiro
contra o motor global e só depois contra o repo — assim um repo pode sobrescrever uma ferramenta
sem alterar o motor. `SPEC_HARNESS_CONFIG` aponta para outra config, útil para smoke tests.

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
  reviews/feature/                 # revisão automática por feature (review-feature)
  reviews/NN/                      # só se você rodou post-verify manual numa spec isolada
  feedback.md
~~~

Logs das sessões de implementação: `/tmp/spec_harness/logs/<feature>-<NN>/<fase>-<tentativa>.log`.

## Referências

| Etapa | Arquivo |
|---|---|
| Campos do packet e contratos entre specs | `references/task-packets.md` |
| Gates, evidência e revisão semântica | `references/verify.md` |
