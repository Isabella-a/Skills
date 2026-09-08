# Fase 4 — Geração da Pasta SDD

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
- Contratos/schemas reais da Fase 1 (DTOs, entidades, colunas de migration, resposta de API)
- Arquitetura da feature nas camadas que `PROJECT_MAP.md` declara
- Dependências e reutilização de helpers/hooks/componentes existentes (da Fase 2)
- Open Questions ainda abertas
- Campo **Ticket**: preencha com a chave (`ABC-1234`) se a Fase -1 buscou um ticket; remova a
  linha do template se a feature veio só de descrição livre

### `implementacao.md`

Leia `templates/implementacao.md` e preencha com:
- Tabela de specs na ordem de implementação validada na Fase 3
- Grafo de dependências entre specs
- Critério de conclusão da feature completa

### `progresso.md`

Leia `templates/progresso.md` e preencha com:
- Lista de todas as specs com status `🔴 Não iniciado`
- Log vazio (será preenchido durante a execução via `spec-harness`)

### `specs/NN-nome.md` (uma por spec)

Para cada spec validada na Fase 3:

1. Leia `templates/spec.md`
2. Leia `regras/qualidade.md` — aplique todas as regras antes de escrever
3. Preencha o template com o conteúdo específico da spec, na notação e nos padrões que
   `PROJECT_MAP.md` declara — inclusive a seção `## Arquivos permitidos`, que é o que o
   `spec-harness` lê para montar o packet
4. Nomeie o arquivo com prefixo numérico: `01-`, `02-`, `03-`, ...

---

## Regra de granularidade das specs

Cada spec deve ser uma implementação testável de forma independente, agrupada por
entidade/módulo (backend) ou área de feature (frontend) — não pelo menor use-case/tela
possível:
- Pode ser implementada e testada sem depender do código de outra spec (exceto se dependência
  declarada explicitamente)
- Se uma spec depende de outra para rodar os testes, ela é grande demais — quebre-a
- Uma spec cobrindo backend E frontend ao mesmo tempo é grande demais — quebre por lado
  (contrato/endpoint primeiro, consumo na tela depois). Essa regra não afrouxa: o
  `spec-harness` e o `CLAUDE.md` raiz exigem que cada mudança fique escopada a um app só (CI
  separado por `paths:`)
- Uma spec pode cobrir todos os use-cases backend de uma mesma entidade/módulo (ex.: CRUD
  inteiro — criar, listar, atualizar, remover), ou todas as telas de uma mesma área de feature
  frontend, desde que continuem testáveis sem depender do código de outra spec
- Quebre em specs separadas só quando cruzar entidade/módulo (backend) ou área de feature
  (frontend) diferente

---

## Após gerar todos os arquivos

Imprima a lista de arquivos criados e diga ao usuário:

> "A pasta SDD está em `.specs/sdd-<slug>/`. Revise os arquivos em `specs/` — cada um é uma
> unidade de implementação independente. Antes de acionar o `spec-harness`, confirme que os RFs
> estão todos com 🟡 e que não há `⚠️ ABERTO:` pendente. A implementação real acontece via Task
> Packets (`spec-harness`), não editando código a partir daqui diretamente. Quando a
> implementação começar, cada fase aprovada atualiza `progresso.md`."
