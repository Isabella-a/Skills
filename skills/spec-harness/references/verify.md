# Verificação do SDD Harness

No fluxo normal você **não chama `verify-packet`**: o `autorun` o executa ao fim de cada fase.
Este documento descreve o que ele checa, o que grava e o que sobra para a revisão humana antes
do `merge-spec`.

Os gates gravam um `.evidence.json` ao lado do packet expandido
(`.specs/sdd-<feature>/packets/.expanded/SDD-NN-<fase>.evidence.json`). A chamada manual existe
para depurar uma fase isolada, e exige a execução ativa correspondente (`$HARNESS` = caminho do
`harness.ts` conforme a instalação, plugin ou manual — ver SKILL.md):

~~~bash
node $HARNESS verify-packet .specs/sdd-<feature>/packets/.expanded/SDD-NN-<fase>.yaml
~~~

## Gates automáticos

- packet estruturalmente válido;
- spec Markdown existente e sem marcador `⚠️ ABERTO:` pendente;
- IDs RF/EC/T existentes na spec;
- diff restrito a `capabilities.write.paths` e ao escopo declarado em `app` — sem cruzar o
  diretório de um domínio com o de outro nem com o escopo `shared`;
- novas alterações em arquivos previamente sujos detectadas por fingerprint;
- validações referenciadas em `done_when.validation_ids` executadas;
- contratos estruturais de `validation.artifacts` satisfeitos, quando declarados;
- validadores globais rodados nos `.py` alterados do escopo — hoje `ruff check`
  (`format` e `typecheck` estão desligados na config; o porquê está no `SKILL.md`);
- estado runtime e bloqueios registrados quando a execução veio de `open-packet`;
- runtime do mesmo `open-packet` obrigatório e ligado à evidência por hash;
- bloqueios preventivos exigem revisão no modo default `review`; no modo
  `enforcement.blocked_tool_calls: fail`, qualquer bloqueio invalida o run;
- RED validado pelo erro esperado declarado, não por qualquer retorno não zero — em Python isso
  significa exit 1 com `failed` na saída, nunca o exit 2 de erro de coleta (ver
  `task-packets.md#módulo-que-ainda-não-existe`).

Cada execução também acrescenta uma linha JSON em
`${SPEC_HARNESS_METRICS_FILE}` ou `/tmp/spec_harness/metrics.jsonl` com
arquivos alterados, chamadas bloqueadas e totais de validação.

## CRAP (preparação da revisão, não gate do VERIFY)

CRAP **não roda mais na fase VERIFY**: é preparação da revisão por feature, rodada dentro do
próprio `review-feature`, antes de abrir a sessão do job de code review. Mede risco nas funções
de produção que a **feature inteira** alterou (diff `base...branch`, acumulando todas as specs já
mergeadas), não o diff de uma spec isolada:

1. Descobre quais **escopos** a feature tocou (interseção do diff com `scopes.paths`) e roda
   CRAP uma vez por escopo tocado — uma feature típica toca um só, mas nada impede mais de um.
2. Para cada escopo: roda a suíte com relatório de cobertura (`crap.coverage_command`, alvos de
   `crap.scope_tests` ou derivados de `scopes.paths`) — o denominador é a suíte do escopo, não só
   os arquivos que a feature tocou, o que infla o CRAP de código já coberto;
3. chama a ferramenta declarada em `crap.tool` (`--only-from` restrito aos arquivos do escopo):
   `CRAP = complexidade² × (1 − cobertura)³ + complexidade`. Duas implementações, escolhidas por
   `crap.runtime`:
   - **Node** (**padrão**, `tools/crap_calculator.ts`, `runtime: "node"`): exige `eslintcc` (e
     `@typescript-eslint/parser` para `.ts`/`.tsx`) como devDependency do repo, e um
     `coverage_command` que gere um relatório Istanbul (`coverage-final.json` — o reporter
     `json` do jest/vitest, ou `nyc --reporter=json`). Nesse caso, `{coverage_json}` no comando
     recebe um **diretório** (`--coverage.reportsDirectory`/`--coverageDirectory`/`--report-dir`),
     não um arquivo — o nome `coverage-final.json` é fixo do reporter Istanbul.
   - **Python** (`tools/crap_calculator.py`, `runtime: "python"`): exige `radon` e um plugin de
     cobertura que gere JSON do coverage.py no ambiente do repo; aí `{coverage_json}` volta a ser
     um arquivo (`--cov-report=json:{coverage_json}`).
   Ambas produzem o mesmo shape de saída — o resto do harness (`{crap_top}`) não diferencia qual
   rodou.
4. Os resultados de todos os escopos tocados são combinados num relatório só.

Artefatos em `.specs/sdd-<feature>/reviews/feature/`: `crap.json` e `crap-arquivos.txt` (os
relatórios de cobertura brutos, >1 MB cada, ficam em `/tmp/spec_harness/coverage/`). O top-N
entra no prompt do job de revisão como `{crap_top}`.

O gate é `warn` por padrão: função acima de `crap.threshold` (30) vira aviso e pista de revisão.
Como isso roda **depois** de todas as specs já mergeadas, `crap.gate: "block"` não impede merge
nenhum — só faz `review-feature` sair com exit 1, como sinal para quem orquestra. Cobertura não
gerada, relatório ausente ou escopo sem diretório de testes conhecido = **inconclusivo** (campo
`note`), nunca aprovação silenciosa — e não impede os demais escopos tocados de serem avaliados.

CRAP é sinal, não alvo: um teste sem `assert` derruba o número igual a um teste bom. Por isso
nenhuma sessão de modelo recebe "reduza o CRAP" como tarefa — quem lê o número é o job de code
review e você.

## Revisão automática (por feature, não mais na fase VERIFY)

A fase VERIFY, ao passar os gates, só commita — nem CRAP nem a revisão automática rodam mais
aqui. Os dois são preparação/execução da revisão por feature, disparados juntos por um único
comando depois que todas as specs da feature já estiverem mergeadas:

~~~bash
node $HARNESS review-feature <feature-slug> --base <ref-onde-a-feature-começou>
~~~

Ver `SKILL.md § Revisão automática — por FEATURE, não por spec`. Marcador `.post-verify.json` em
`reviews/feature/` impede reexecução no mesmo `head_sha`; `--force` refaz.

O template padrão traz **um job** (`code_review`) com duas passadas na mesma sessão: Passada 1
usa a skill `code-review-skill` (**não** é dependência garantida do plugin — troque para
`mattpocock-skills:code-review` se não estiver instalada), Passada 2 usa `ponytail:ponytail-review`
(essa sim, dependência do plugin `claude-skills`).

O que olhar antes de continuar:

| Artefato | Para quê |
|---|---|
| `.specs/sdd-<feature>/reviews/feature/code-review.md` | achados da Passada 1, por severidade, com arquivo:linha |
| `.../code-review.json` | veredito estruturado (`blocking`) |
| `.../ponytail-review.md` | achados da Passada 2 — over-engineering (dependência/abstração desnecessária) |
| `.../code_review.log` | a sessão crua do agente, quando algo saiu errado |
| `.../crap.json` | complexidade × cobertura das funções que a feature alterou, agregado por escopo tocado — insumo de `{crap_top}` no prompt acima |

`code-review.json` **ausente** é revisão inconclusiva, não aprovação: o harness imprime o aviso
e você deve ler o log. Como isso acontece **depois** de todas as specs já mergeadas,
`post_verify.gate: "block"` não bloqueia merge nenhum — só faz `review-feature` sair com exit 1,
como sinal para quem orquestra decidir o que fazer (reabrir uma spec, registrar débito, etc.).

`require_quiz_pass` e o job `cognitive_loop` (explicador + micro-mundo + quiz-trava) saíram do
template padrão — era a sessão mais cara do fluxo, rodando incondicionalmente. Seguem disponíveis
como skill (`cognitive-loop:explain-diff`) para quem quiser rodar manualmente.

Para revisar **uma spec isolada** manualmente, fora do fluxo padrão:

~~~bash
node $HARNESS post-verify .specs/sdd-<feature>/packets/.expanded/SDD-NN-verify.yaml
~~~

## Retry após falha

O `autorun` já retenta a própria fase (`implementer.max_attempts`, padrão 2), passando os erros
do gate como feedback para a sessão seguinte. Quando ele para, leia o campo `errors` da
evidência — ele tem o motivo mecânico exato, sem precisar reler o diff.

Uma sessão que termina com **zero arquivo alterado** quase nunca é problema de código: é limite
de gasto da conta, spawn falhando ou path bloqueado pelo hook. O autorun imprime a cauda do log
nesse caso; confirme antes de culpar a spec.

Não edite o packet para afrouxar `contract`/`forbidden.behaviors` só para passar o gate. Se o
contrato está errado, a correção é na spec Markdown.

## Revisão manual obrigatória

O verifier ainda deve conferir os campos de `manual_review` da evidência:

- `contract.must`;
- `contract.must_not`;
- `forbidden.behaviors` (ex.: captura de exceção genérica antes das específicas, log via `print`/
  `console.log` em vez do logger do repo, import cruzando domínios, credencial fora do cofre de
  segredos do repo, ou apagar um comentário `ponytail:` só para satisfazer um gate — a marcação
  existe justamente para não se perder);
- `review.focus`.

`status: ready_for_review` não significa aprovação final. Significa que os gates mecânicos
passaram e que a revisão semântica pode começar sem recarregar o repositório inteiro — os
agentes de revisão automática (`code_review`/`ponytail_review`) **ainda não rodaram** nesse
ponto: eles só rodam por feature, via `review-feature`, depois que todas as specs já
mergearam.

### Atualizar os selos da spec Markdown

Depois que o VERIFY aprova os gates e a revisão manual acima não encontra pendência, edite a
própria spec (`.specs/sdd-<feature>/specs/NN-*.md`) trocando 🟡 por ✅ nos `RF-XX`/`EC-XX`/`T-XX`
e itens do checklist efetivamente cobertos — não só na seção `## Contratos`. Faça isso **antes**
do `merge-spec`: ele apaga a branch e o worktree da spec. Um RF/EC ainda 🟡 nesse ponto é sinal
de que não foi coberto por teste nenhum, ou ficou pendente sem `⚠️ ABERTO:` registrado — trate
como bloqueio.

Não aceite somente o relato do implementador nem só o parecer do agente de code review. Use a
spec Markdown, o `.evidence.json`, o diff e os resultados de validação.

Na revisão externa, não execute `verify-packet` avulso. Reproduza o `test_command` declarado,
inspecione a evidência vinculada ao runtime e revise o resultado direto na branch da spec
(`git log`/`git diff main...spec/<feature>/<NN>`). Commits só existem em fases que passaram os
gates automáticos — tudo que está na branch já foi validado mecanicamente. O que falta é
semântico, e é seu.

`autorun --no-merge` existe para essa pausa. Sem a flag, o merge e o apagamento da branch
acontecem no fim do próprio autorun, sem intervalo para leitura.

Lembre que o PR do repositório ainda tem gates próprios de CI (suíte completa, cobertura mínima,
revisão automática de PR, quando existirem). A revisão automática do harness (`review-feature`)
acontece depois que as specs já mergearam na branch de trabalho, mas antes do PR dessa branch —
não é a única, e não substitui a revisão semântica desta seção.
