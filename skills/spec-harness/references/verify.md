# Verificação do SDD Harness

No fluxo normal você **não chama `verify-packet`**: o `autorun` o executa ao fim de cada fase.
Este documento descreve o que ele checa, o que grava e o que sobra para a revisão humana antes
do `merge-spec`.

Os gates gravam um `.evidence.json` ao lado do packet expandido
(`.specs/sdd-<feature>/packets/.expanded/SDD-NN-<fase>.evidence.json`). A chamada manual existe
para depurar uma fase isolada, e exige a execução ativa correspondente:

~~~bash
node ~/.claude/spec_harness/harness.ts verify-packet .specs/sdd-<feature>/packets/.expanded/SDD-NN-<fase>.yaml
~~~

## Gates automáticos

- packet estruturalmente válido;
- spec Markdown existente e sem marcador `⚠️ ABERTO:` pendente;
- IDs RF/EC/T existentes na spec;
- diff restrito a `capabilities.write.paths` e ao escopo declarado em `app` — sem cruzar
  `app/plataformas/<dominio>/` com outro domínio nem com `app/shared/`;
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

## CRAP (fase VERIFY, determinístico)

Depois do commit da fase VERIFY e **antes** da revisão automática, o harness mede risco nas
funções de produção que a spec alterou (diff `base...spec/<feature>/<NN>`, não o diff da fase):

1. roda a suíte do **escopo** com `--cov-report=json` (`crap.coverage_command`, alvos de
   `crap.scope_tests` ou derivados de `scopes.paths`) — o denominador é a suíte do app, não o
   `test_command` da spec, que infla o CRAP de código já coberto;
2. chama `~/.claude/spec_harness/tools/crap_calculator.py` com `--only-from` restrito a esses
   arquivos: `CRAP = complexidade² × (1 − cobertura)³ + complexidade`. Exige `radon` e um plugin de
   cobertura que gere JSON do coverage.py no ambiente do repo.

Artefatos em `.specs/sdd-<feature>/reviews/<NN>/`: `crap.json` e `crap-arquivos.txt` (o
`coverage.json` bruto, >1 MB, fica em `/tmp/spec_harness/coverage/<feature>-<NN>.json`). O resumo
(média, funções acima do limiar, alvos usados) vai para o campo `crap` da evidência, e o top-N
entra no prompt do code review como `{crap_top}`.

O gate é `warn` por padrão: função acima de `crap.threshold` (30) vira aviso e pista de revisão.
Com `crap.gate: "block"`, ela grava `status: review_blocked` e reprova o VERIFY. Cobertura não
gerada, `crap.json` ausente ou escopo sem diretório de testes = **inconclusivo** (campo `note`),
nunca aprovação silenciosa.

CRAP é sinal, não alvo: um teste sem `assert` derruba o número igual a um teste bom. Por isso
nenhuma sessão de modelo recebe "reduza o CRAP" como tarefa — quem lê o número é o code review e
você.

## Revisão automática (fase VERIFY)

Ao passar os gates, a fase VERIFY commita e o harness dispara em paralelo, em **sonnet**, uma
única vez por spec (marcador `.post-verify.json`; um retry do autorun não redispara),
os jobs de `post_verify` da config: `code-review-skill` e `cognitive-loop:explain-diff`
(que encadeia micro mundos e o quiz-trava). Ver `SKILL.md#revisão-automática-pós-verify`.

O que olhar antes de continuar:

| Artefato | Para quê |
|---|---|
| `.specs/sdd-<feature>/reviews/<NN>/code-review.md` | achados por severidade, com arquivo:linha |
| `.../code-review.json` | veredito estruturado (`blocking`), lido pelo gate |
| `.../cognitive-loop/explainer.html` | o explicador da mudança + micro mundo(s) + quiz embutido |
| `.../code_review.log`, `.../cognitive_loop.log` | a sessão crua de cada agente, quando algo saiu errado |
| `.evidence.json` → `post_verify` | exit code, diretório e nº de achados bloqueantes de cada job |
| `.../crap.json`, `.evidence.json` → `crap` | complexidade × cobertura das funções alteradas |

`code-review.json` **ausente** é revisão inconclusiva, não aprovação: o harness imprime o aviso
e você deve ler o log antes de mergear. Com `post_verify.gate: "block"`, um achado
`blocking: true` grava `status: review_blocked` na evidência — e como o merge só acontece com as três
fases em `ready_for_review`, nem o `autorun` nem o `merge-spec` mergeiam.

Se `post_verify.require_quiz_pass` estiver ligado, o merge também exige
`.cognitive-loop/quiz/<sha-da-ponta-da-branch>.passed` — o arquivo que o `/quizzes` grava só
quando o quiz é gabaritado. Sem ele o harness para **sem** mergear nem apagar branch/worktree.

Para reexecutar só a revisão (depois de ajustar prompt/modelo na config):

~~~bash
node ~/.claude/spec_harness/harness.ts post-verify .specs/sdd-<feature>/packets/.expanded/SDD-NN-verify.yaml
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
- `forbidden.behaviors` (ex.: `except Exception` antes das exceções específicas, `print()` em vez
  de `logger`, acesso a Redis fora do `StateManager`, import cruzando domínios, credencial fora
  de `get_secret_value()`);
- `review.focus`.

`status: ready_for_review` não significa aprovação final. Significa que os
gates mecânicos passaram, que os agentes de revisão já rodaram e que a revisão
semântica pode começar sem recarregar o repositório inteiro.

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

Lembre que o PR do repositório ainda tem gates próprios — em `dados-one-assistant`,
`.github/workflows/automated_tests.yaml` roda a suíte completa com PostgreSQL real e a cobertura
de 80%, e `gemini-review.yml` faz o review automático do PR. A revisão do harness é a que
acontece cedo, não a única.
