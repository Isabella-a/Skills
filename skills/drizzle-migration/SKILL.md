---
name: drizzle-migration
description: Retoma e registra o progresso da migração TypeORM → Drizzle do backend One Portal. Gera relatório de estado real (derivado do código, não de prosa), carrega as decisões já travadas e aponta o próximo passo concreto. Use quando o usuário disser "onde paramos na migração do drizzle", "continuar a refatoração do drizzle", "relatório da migração", "checkpoint da migração", "vamos migrar o próximo repository", ou ao iniciar/encerrar qualquer sessão de trabalho na branch de migração. NÃO use para dúvidas gerais de Drizzle sem relação com esta migração.
---

# Migração TypeORM → Drizzle — One Portal backend

Esta skill existe por um motivo específico: a migração é grande (≈57 repositories, ~15 mil
linhas, 91 entities) e vai atravessar **muitas sessões**. O contexto se perde entre elas. Sem
um estado durável e **verificável**, cada sessão nova recomeça do zero, re-decide o que já foi
decidido e reintroduz padrões inconsistentes.

## Estratégia acordada (não re-litigar)

- **Uma única branch, um único PR.** Nada de migração faseada em produção — TypeORM e Drizzle
  **nunca** coexistem em ambiente rodando.
- **Mas coexistem DENTRO da branch durante o desenvolvimento.** Isso é deliberado: cada commit
  mantém `build` + `lint` + e2e verdes, migrando um repository (ou uma coorte) por vez. Sem
  isso, a branch vira milhares de erros de tipo e você perde todo sinal de progresso.
- **O descomissionamento é a última fase**, imediatamente antes de abrir o PR: remover
  `typeorm`/`@nestjs/typeorm`, as 91 entities, o `TypeOrmModule`, o `TypeOrmUnitOfWork` e o
  scaffolding temporário.
- **Deploy:** primeiro `develop` (validação funcional completa do sistema), depois produção.

## Os arquivos de estado

Vivem em `apps/backend/docs/drizzle-migration/` e são **commitados na branch de migração** —
viajam com o código e sobrevivem a qualquer perda de contexto.

| Arquivo | Conteúdo | Quem escreve |
|---|---|---|
| `PROGRESS.md` | Estado atual + próximo passo + padrões + armadilhas + log de sessões | Métricas: geradas. Narrativa: você. |
| `DECISIONS.md` | Decisões tomadas na execução, com justificativa (append-only) | Você, ao decidir algo novo |
| `EXECUTION-PLAN.md` | O passo-a-passo: Fases 0 e 1 em detalhe, receita repetível das 2–6, arquivos-modelo a copiar | Estável — só muda se o plano mudar |
| `STRATEGY.md` | O porquê: inventário de partida, fases, decisões técnicas, riscos, critérios de parada | Estável — só muda se a estratégia mudar |
| `baseline.json` | Inventário congelado no início — denominador do progresso | Gerado uma vez. **Nunca editar.** |

Ordem de leitura numa sessão nova: `PROGRESS.md` (onde estamos) → `EXECUTION-PLAN.md` (como fazer
o próximo passo) → `DECISIONS.md` (o que já foi resolvido) → `STRATEGY.md` só se precisar
rediscutir rumo.

⚠️ `EXECUTION-PLAN.md` **supersede as decisões 4 e 5 da `STRATEGY.md`**. Em caso de conflito
entre os dois, o `EXECUTION-PLAN.md` ganha.

### Regra anti-drift (a mais importante desta skill)

**Nunca escreva à mão um número que o código pode provar.** Contagens, percentuais, quais
repositories faltam, quem ainda importa `typeorm` — tudo isso é **gerado**. O relatório
mente rápido se alguém digita "38 de 57 migrados" e a realidade é outra.

A prosa serve só para o que o código **não** consegue contar: por que uma decisão foi tomada,
qual armadilha foi descoberta, o que está verificado de fato, e qual é o próximo passo.

## Modos de uso

### Início de sessão — "onde paramos?"

1. Rode o scanner:
   ```bash
   node .claude/skills/drizzle-migration/scripts/scan-progress.mjs
   ```
2. Leia `apps/backend/docs/drizzle-migration/PROGRESS.md` e `DECISIONS.md` (a `STRATEGY.md` só
   se precisar do plano completo).
3. Abra o **arquivo canônico** apontado em "Padrões estabelecidos" do PROGRESS.md — é o
   repository migrado que serve de modelo. **Copie o padrão dele em vez de reinventar.**
4. Resuma ao usuário em poucas linhas: % real, fase, próximo passo, e qualquer alerta do
   scanner (débito com `develop`, working tree sujo).

Se o scanner e o PROGRESS.md discordarem, **o scanner ganha** — e corrija o PROGRESS.md.

### Durante a sessão

Trabalhe em commits pequenos, um repository (ou coorte transacional) por vez. Antes de
considerar qualquer repository pronto:

```bash
npm run lint    --workspace @one-portal/backend
npm run build   --workspace @one-portal/backend
npm run test:e2e --workspace @one-portal/backend src/modules/<modulo>/...
```

**Os e2e devem passar sem alterar asserts** — é o teste de paridade que prova que o Drizzle
reproduz o comportamento do TypeORM. Se precisou mudar um assert, ou achou um bug pré-existente
(registre) ou quebrou comportamento (conserte).

### Fim de sessão — checkpoint

Sempre atualize o PROGRESS.md antes de encerrar, mesmo em sessão curta. Ordem:

1. Rode o scanner e **substitua** o bloco gerado do PROGRESS.md pela saída nova.
2. Reescreva **"Próximo passo"** — a coisa mais valiosa do documento. Concreto e acionável:
   nome do arquivo e o que fazer nele, não "continuar a migração".
3. Acrescente ao **log de sessões** uma linha: o que foi feito, o que ficou pela metade.
4. Se descobriu armadilha nova → seção "Armadilhas". Se decidiu padrão novo → `DECISIONS.md`.
5. Se deixou algo **quebrado ou não verificado**, diga explicitamente em "Débito de
   verificação". Um relatório que esconde débito é pior que não ter relatório.

O template está em `references/report-template.md` (use no kickoff).

## Invariantes que não podem quebrar

Verifique a cada checkpoint — são as regressões que a migração pode introduzir em silêncio:

1. **Soft delete** — 46 entities têm `deletedAt`. No TypeORM o filtro é implícito em todo
   `find`; no Drizzle **cada query precisa lembrar**. É o maior risco de regressão silenciosa
   da migração inteira (dado deletado vazando em listagem). Todo repository com `deletedAt`
   precisa de e2e com **seed adversarial**: semear uma linha deletada e assertar que ela não
   aparece.
2. **Coorte transacional** — uma transação **não** atravessa os dois ORMs. Todos os
   repositories tocados por um mesmo fluxo de `UnitOfWork.exec()` migram no mesmo commit, ou o
   fluxo inteiro fica em TypeORM até lá. Violar isso gera commit parcial silencioso — exatamente
   o bug que o ADR #2 existe para evitar.
3. **Save-cascade** — ~29 relações com `cascade: true` (raízes: `ManagedClients`, `Users`).
   Drizzle não tem cascade de aplicação. Antes de portar um agregado, capture o comportamento
   atual num e2e "golden" — **incluindo o que o cascade não faz** (hoje filhos removidos do
   array não são deletados; preserve essa semântica, não "conserte" de brinde).
4. **Paridade de shape** — os services consomem grafos aninhados (ex.:
   `revenue.supplier.supplierInfo.companyName`) e mapeiam com `class-transformer`. O shape que o
   repository devolve é contrato de fato. `db.query.X.findMany({ with })` reproduz; joins
   manuais achatam.
5. **TypeORM é a autoridade única de migrations até a Fase 6** — não gerar migration com
   `drizzle-kit` durante a migração (um swap puro de ORM não muda schema, então não deveria haver
   migration nova na branch). Se um merge de `develop` trouxer migration nova, rode
   `drizzle-kit pull` e reaplique a curadoria sobre o diff. Ver `DECISIONS.md` nº 2.
6. **Build verde em todo commit.** Se um commit precisa quebrar o build, ele está grande demais.

## Armadilhas conhecidas do terreno

Levantadas na avaliação inicial — evitam redescoberta caiada:

- **SQL Postgres-específico embutido nos query builders**, não só nos `.query()` crus:
  `unaccent`, `jsonb_agg`, `DISTINCT ON`, `FILTER (WHERE ...)`, `= ANY($1)`, casts `::enum[]`,
  `ON CONFLICT DO UPDATE`, `REGEXP_REPLACE`, `NULLS FIRST/LAST`, subqueries correlacionadas.
  Resolver com `sql\`\`` template — **não force o query builder onde SQL já é a linguagem certa.**
- **`with` de relação `one` não aceita `where`** no Drizzle. Relevante justamente onde o
  TypeORM filtrava pai/filho soft-deleted implicitamente.
- **Relational queries geram lateral joins/jsonb** — rode `EXPLAIN` comparativo nos endpoints
  de listagem grandes antes de dar por pronto.
- **`operational.repository.ts` é genérico por `EntityTarget`** (`dataSource.getRepository(x)`).
  Não tem equivalente direto: precisa de registry `Record<nome, PgTable>` + generics sobre
  `PgTable`.
- **Fora de escopo, não confunda com pendência:** `one-finder-{read,write,sync}.repository.ts`
  (pg.Pool + SQL cru contra Postgres externo — o lado de lá já é Drizzle) e
  `parquet.repository.ts` (DuckDB). O scanner já os classifica como fora de escopo.
- **`getQueryBuilder()` público no `BaseRepository` deve morrer** — cada call site vira método
  nomeado no repository, com `$dynamic()` internamente para composição condicional.
- **Os 203+ e2e continuam seedando via `globalThis.dataSource` + entities até o fim.** Isso é
  intencional (mesmo banco, funciona), e não pendência. A conversão em massa é mecânica e fica
  para a fase de descomissionamento.

## Ordem de execução recomendada

O scanner ordena os pendentes por tamanho, mas a ordem de **ataque** é outra:

1. **Fundação** — schema completo (via `drizzle-kit pull` + curadoria), `DrizzleBaseRepository`,
   `SoftDeleteBaseRepository`, `DrizzleUnitOfWork`, porte dos 6 `test/in-memory-repositories/`
   (estendem o `BaseRepository` real e quebram junto), matriz de coortes transacionais.
   **Não** mexer no `setup-e2e.ts` aqui — os 245 imports são um subconjunto curado de 308, e a
   troca do migrator ficou para a Fase 6 (`DECISIONS.md` nº 2).
2. **Cauda longa** — os ~40 repositories CRUD pequenos. Constrói fluência e valida a fundação
   com risco baixo.
3. **Complexos médios** — os com query builder pesado (revenue, wallet, wallet-reallocation).
4. **Os dois monstros** — `managed-client` (~2.800 linhas) e `managed-client-account` (~2.500):
   método a método, com a Impl TypeORM sendo delegada por composição para o que ainda não foi
   portado. Sem essa fatia, viram commits irrevisáveis.
5. **Resíduos** — views, `operational.repository`, transações cruas → `UnitOfWork`.
6. **Descomissionamento** — remover TypeORM, converter seeds e2e, atualizar ADR #2,
   `apps/backend/CLAUDE.md` e `MONOREPO.md`.

## Sincronização com `develop`

A branch vai viver semanas e `develop` não para. O scanner reporta commits não integrados que
tocaram a camada de banco — **esses são os que podem ter adicionado código TypeORM novo para
portar**. Faça merge de `develop` com frequência (semanal no mínimo): quanto mais tarde, mais
caro, porque cada repository novo em `develop` é trabalho de migração que você ainda não sabia
que tinha.

## Convenções do projeto que continuam valendo

Português nas respostas e commits; Conventional Commits (`refactor(database): ...`); **nunca**
`Co-Authored-By` do modelo; lint + type-check antes de concluir. Ver `/CLAUDE.md` e
`apps/backend/CLAUDE.md`.
