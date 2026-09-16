# Fase 6 — Geração da Pasta SDD

Crie a estrutura de pastas e arquivos em `.specs/sdd-<feature-slug>/`.

`.specs/` é o diretório que a skill `spec-harness` também usa para os Task Packets — por isso a
pasta gerada aqui já nasce no lugar certo, sem passo de migração manual depois.

---

## Estrutura obrigatória

```
.specs/
  sdd-<feature-slug>/
    descricao_alto_nivel.md
    implementacao.md
    progresso.md
    specs/
      01-<nome-spec>.md
      02-<nome-spec>.md
      ...
```

---

## Instruções por arquivo

### `descricao_alto_nivel.md`

Leia `templates/descricao_alto_nivel.md` e preencha com:
- Objetivo e comportamento esperado da feature completa (o QUÊ, não o COMO)
- Contratos/schemas reais da Fase 3 (DTOs, entidades, colunas de migration, resposta de API)
- Arquitetura da feature nas camadas que `PROJECT_MAP.md` declara
- Dependências e reutilização de helpers/hooks/componentes existentes (da Fase 4)
- Open Questions ainda abertas
- Campo **Ticket**: preencha com a chave (`ABC-1234`) se a Fase 1 buscou um ticket; remova a
  linha do template se a feature veio só de descrição livre

### `implementacao.md`

Leia `templates/implementacao.md` e preencha com:
- Tabela de specs na ordem de implementação validada na Fase 5
- Grafo de dependências entre specs
- Critério de conclusão da feature completa

### `progresso.md`

Leia `templates/progresso.md` e preencha com:
- Lista de todas as specs com status `🔴 Não iniciado`
- Log vazio (será preenchido durante a execução via `spec-harness`)

### `specs/NN-nome.md` (uma por spec)

Para cada spec validada na Fase 5:

1. Leia `templates/spec.md`
2. Leia `regras/qualidade.md` — aplique todas as regras antes de escrever
3. Preencha o template com o conteúdo específico da spec, na notação e nos padrões que
   `PROJECT_MAP.md` declara — inclusive a seção `## Arquivos permitidos`, que é o que o
   `spec-harness` lê para montar o packet
4. Nomeie o arquivo com prefixo numérico: `01-`, `02-`, `03-`, ...

---

## Regra de granularidade das specs

Objetivo: menos specs, maiores, agrupadas por entrega — não pelo menor use-case/tela possível.
Quanto maior a spec sem quebrar a regra abaixo, melhor.

- Cada spec continua testável de forma independente, sem depender do código de outra spec
  (exceto dependência declarada explicitamente em `Depende de`). Isso não afrouxa: é o que o
  `spec-harness` exige mecanicamente — um escopo por packet, hook `PreToolUse` bloqueia
  leitura/escrita fora dos paths declarados
- **Entrega envolve frontend → gere um par acoplado**, não uma spec por camada solta:
  1. `NN-<nome>-backend.md` — contrato/endpoint/persistência necessários
  2. `NN+1-<nome>-frontend.md` — consumo na tela, com `Depende de: NN`
  Numere as duas em sequência, uma logo após a outra (nunca intercaladas com specs de outra
  entrega), e trate-as como **uma entrega vertical só** em `implementacao.md`/`progresso.md`
  (campo `Entrega vertical` no cabeçalho de cada uma, ver `templates/spec.md`). O par entrega
  uma funcionalidade pequena mas de ponta a ponta: a entrega só está concluída quando a spec de
  frontend passa **e** dá pra testar na tela (ver seção "Verificação Manual na Tela" do
  template). Escopo backend e escopo frontend continuam em arquivos `.md` separados porque são
  escopos diferentes no `harness.config.json` — o packet não atravessa isso — mas o **tamanho**
  de cada lado deve ser o máximo que ainda cabe num escopo só (não fatie o backend em
  contrato/persistência/exposição se as três cabem numa spec testável junto)
- **Entrega sem frontend** (backend puro, CLI, job, pipeline): agrupe todos os use-cases da
  mesma entidade/módulo numa spec só (ex.: CRUD inteiro — criar, listar, atualizar, remover — é
  uma spec, não quatro), desde que continue testável sem depender de outra spec
- Quebre em specs (ou pares) separados só quando cruzar entidade/módulo (backend) ou área de
  feature (frontend) diferente — nunca pelo tamanho isolado de um RF ou de uma tela

---

## Após gerar todos os arquivos

Imprima a lista de arquivos criados e diga ao usuário:

> "A pasta SDD está em `.specs/sdd-<slug>/`. Revise os arquivos em `specs/` — cada um é uma
> unidade de implementação independente. Antes de acionar o `spec-harness`, confirme que os RFs
> estão todos com 🟡 e que não há `⚠️ ABERTO:` pendente. A implementação real acontece via Task
> Packets (`spec-harness`), não editando código a partir daqui diretamente. Quando a
> implementação começar, cada fase aprovada atualiza `progresso.md`."
