# Task Packets do SDD

Um packet por spec: `.specs/sdd-<feature>/packets/SDD-NN.yaml`. Ele não redefine a feature — a
spec Markdown continua sendo a fonte da verdade. O packet declara só o que o harness precisa
para executar a spec sem supervisão: escopo, o que pode ser lido e escrito em cada fase, e o que
conta como sucesso.

Você raramente escreve um do zero: `scaffold-packet <spec.md>` gera o arquivo lendo a spec.
Este documento existe para revisar o que ele gerou e para os campos que ele não infere.

## Como gerar

~~~bash
node $HARNESS scaffold-packet .specs/sdd-<feature>/specs/NN-<spec>.md
~~~

(`$HARNESS` = caminho do `harness.ts` conforme a instalação, plugin ou manual — ver SKILL.md.)

Ele extrai da spec:

| Do que | Vira |
|---|---|
| caminho `.specs/sdd-<feature>/specs/NN-*.md` | `feature`, `spec_number`, `source_spec` |
| IDs `RF-*`/`EC-*`/`T-*` das tabelas | `verifies.requirements` |
| bloco `**Produção (fase GREEN)**` de `## Arquivos permitidos` | `impl_paths` |
| bloco `**Testes (fase RED)**` de `## Arquivos permitidos` | `test_paths` |
| prefixo dos paths × `scopes` da config | `app` |
| `test_paths` | `test_command` |
| produção toda nova × produção existente | `red_expects` (+ `missing_module`) |

Só as **linhas de bullet** de cada bloco contam como path — o bloco `**Proibido tocar:**` cita
paths de outros escopos e não pode contaminar o packet. O que não for inferido sai como `TODO` e
o comando falha: palpite de escopo é pior que erro explícito.

## O que revisar no que foi gerado

1. **`app`** — uma spec toca um escopo só. Se o scaffold hesitou, a spec provavelmente atravessa
   domínios e deveria ser mais de uma spec.
2. **`red_expects`** — ver abaixo; é o campo que decide se o gate de RED aceita a falha.
3. **`context_paths`** — vazio por padrão. Acrescente **só** o que a fase precisa ler além da
   spec, dos testes e da produção da própria spec (o `models.py` do domínio, o `conftest.py`
   relevante). Leitura ampla é o que faz a sessão da fase custar caro — o mesmo vale para
   `PROJECT_MAP.md`: nunca o arquivo inteiro, só as seções que a Seção 0 dele indica para o `app`
   deste packet (ver `SKILL.md` § `PROJECT_MAP.md` — leitura escopada).
4. **`phases.<fase>.requirements`** — recorte de IDs por fase, se a spec for grande. Vazio =
   todos os IDs.
5. **`phases.<fase>.artifacts` / `.extra_commands`** — contratos estruturais e validações extras
   (ver "Artefatos" abaixo).

## O que é derivado da fase (e não se edita)

`expand-packet` materializa `packets/.expanded/SDD-NN-{red,green,verify}.yaml` a partir do
unificado. Esses arquivos são gerados: editar um deles é trabalho perdido no próximo comando.

| | RED | GREEN | VERIFY |
|---|---|---|---|
| escreve | `test_paths` | `impl_paths` | nada |
| lê | spec + `context_paths` + testes + produção (igual nas três) | idem | idem |
| validação | `test_command` **falhando** pelo motivo declarado | `test_command` passando + `ruff check` | `test_command` + `ruff check` + revisão automática |
| sessão de modelo | sim | sim | não |

O gate de RED recusa escrita em produção e o de GREEN recusa escrita em teste — pelos
`test_markers` da config, não por convenção de nome.

### Módulo que ainda não existe

Em Python, um teste que importa no topo um módulo inexistente quebra na **coleta**: `pytest` sai
com código 2, sem nenhum "failed" na saída. Isso é indistinguível de um typo no import, e o
harness recusa como RED. Por isso a falha esperada é declarada:

~~~yaml
red_expects: new_module
missing_module: <pacote>.<modulo>
~~~

O gate passa a exigir exit 1, `failed` e o nome exato do módulo na saída. O teste precisa
importar **dentro do corpo**:

~~~python
def test_normaliza_espacos_em_branco() -> None:
    from <pacote>.<modulo> import normaliza_texto   # import DENTRO do teste

    assert normaliza_texto("  a   b ") == "a b"
~~~

Quando a spec altera comportamento de código **já existente** — o caso comum — use
`red_expects: behavior_change` (padrão): import no topo, assert que falha, e o gate proíbe
qualquer `ModuleNotFoundError`/`ImportError`/`SyntaxError` na saída.

## Comando de teste escopado

~~~yaml
test_command: pytest -q --no-cov -p no:cacheprovider <caminho-do-escopo>/tests/unit/test_x.py
~~~

Exemplo (Python/pytest): se o `addopts` do `pytest.ini` já inclui `--cov-fail-under=80` medindo
`app/` inteiro, qualquer execução escopada a um arquivo reprova por cobertura mesmo com todos os
testes verdes — daí o `--no-cov`. `-p no:cacheprovider` evita que o `.pytest_cache` do worktree
suje o fingerprint. Adapte à flag equivalente do stack do repo (ou nenhuma, se o runner não força
cobertura mínima globalmente).

O comando roda o(s) arquivo(s) **da própria spec**, nunca a suíte inteira: rodar tudo em cada
fase de cada spec é lento e mistura falhas alheias no gate desta. A suíte completa e a cobertura
são gate do CI do repositório.

## Artefatos

Contratos estruturais sobre um arquivo, verificados sem executar nada — úteis quando o requisito
não é observável pelo teste (um ADR que precisa existir, um logger obrigatório):

~~~yaml
phases:
  green:
    artifacts:
      - path: <caminho-do-escopo>/service.py
        requirements: [RF-01]
        contains: ["logger."]
        min_count: 1
~~~

Aceita `contains`, `not_contains`, `regex`, `not_regex` e `min_count`.

## Contrato de interface entre specs

Quando a spec NN depende da spec MM (`Depende de` no cabeçalho), o packet **não** lista os
arquivos de produção da MM em `context_paths`. Lê-se a seção `## Contratos` da spec MM, que é
onde a MM declara o que expõe. Isso mantém as specs desacopladas: a MM pode mudar a
implementação sem invalidar o contexto da NN.

~~~yaml
required_reads:
  - .specs/sdd-<feature>/specs/07-<spec-dependente>.md
  - .specs/sdd-<feature>/specs/05-<spec-dependida>.md   # só pela seção ## Contratos
~~~

### Caso cross-escopo: contrato no escopo `shared`

Um DTO usado por mais de um domínio não é redigitado em cada um. Vira uma spec própria escopada
no escopo `shared` (ver `scopes` do `harness.config.json`), com `app: shared`, e as specs
dependentes leem a seção `## Contratos` dela. Um packet que listasse o caminho de outro escopo
fora do seu `app` é reprovado na validação — é a regra de dependências entre camadas do
`CLAUDE.md`/`AGENTS.md` do repositório aplicada ao harness.

## Orçamento de leitura

`token_budget` é preenchido pelo scaffold com o padrão do repo (8 leituras iniciais, 500 linhas
por leitura, 50 resultados de busca, sem leitura ampla). Mexer nele só faz sentido quando a spec
é genuinamente grande — e, se for, o sinal costuma ser que ela deveria estar dividida.

Isso vale também para `PROJECT_MAP.md`, fora do orçamento formal do packet: ele é lido de novo em
cada fase (RED, GREEN, revisão) e em cada spec da mesma feature, então ler o arquivo inteiro
todas essas vezes é o jeito mais fácil de estourar o orçamento sem que apareça no `token_budget`
do packet. Leia só as seções que a Seção 0 do próprio `PROJECT_MAP.md` indica para o `app`/
domínio deste packet — nunca o documento inteiro. Ver `SKILL.md` § `PROJECT_MAP.md`.

## Bloqueios

O hook `PreToolUse` bloqueia leitura/escrita fora dos paths declarados enquanto a sessão da fase
roda, e grava cada bloqueio em `/tmp/spec_harness/blocked/<run_id>.jsonl`. Com
`enforcement.blocked_tool_calls: review` (padrão) os bloqueios entram na evidência e pedem
revisão; com `fail`, qualquer bloqueio invalida a fase.

Bloqueio recorrente no mesmo path é diagnóstico, não ruído: ou o packet está com escopo apertado
demais para o que a spec pede, ou a spec está pedindo mais do que declarou em
`## Arquivos permitidos`. Nos dois casos a correção é no texto, não em afrouxar o gate.

## Paralelismo

Duas specs só rodam em paralelo se seus paths de leitura e escrita não se cruzarem.
`run-parallel` valida isso antes de abrir os worktrees e recusa a execução em caso de
interseção (`--force` ignora a checagem — use apenas quando souber que o cruzamento é só de
prefixo).
