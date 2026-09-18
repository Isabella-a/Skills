# Domínio: <Nome do domínio>

> Parte de `docs/knowledge/`. Roteado a partir de `INDEX.md` — se você chegou aqui direto sem
> passar pelo índice, confira lá se este é mesmo o arquivo certo antes de ler tudo.
>
> Este arquivo é só **regras de negócio**. Vocabulário do domínio vive no `CONTEXT.md` apontado
> por `INDEX.md`/`CONTEXT-MAP.md` (skill/convenção `mattpocock-skills:domain-modeling`). Decisão
> técnica com trade-off vira ADR em `docs/adr/` (mesma convenção) — aqui só se referencia.

## O que é

<1-3 frases: o que este domínio cobre no negócio. Se quiser detalhe de vocabulário, é no
`CONTEXT.md`, não aqui.>

## Onde vive no código

- <workspace 1>: `<caminho>`
- <workspace 2>: `<caminho>`

## Regras de negócio

> Cada regra: o que é, por que existe (se souber) e origem rastreável — já que specs são
> apagadas após o merge, este é o registro definitivo. Regra sem origem clara vira ⚠️ ABERTO em
> vez de inventada.

- **RN-<DOMINIO>-<NNN> — <Nome curto da regra>**: <descrição objetiva>.
  - **Por quê:** <motivação de negócio, se conhecida — senão "⚠️ ABERTO: motivo não confirmado">
  - **Origem:** <spec extinta (nome), PR #, ADR (link para `docs/adr/NNNN-slug.md`), ou "grilling em <data>">
  - **Onde é aplicada:** <arquivo:função, só se ajudar a achar rápido — não é obrigatório>
  - **Status:** vigente | superada por RN-<DOMINIO>-<NNN> em <data>
  - **Substitui:** RN-<DOMINIO>-<NNN> | não se aplica

> Regra superada permanece neste histórico: não apague nem reutilize seu ID. A regra que a
> substitui deve apontar de volta para ela em **Substitui**.

## ADRs relevantes para este domínio

- <link para `docs/adr/NNNN-slug.md` ou `<caminho-do-contexto>/docs/adr/NNNN-slug.md`> — <título>

## Em aberto (⚠️)

- <pergunta sem resposta + o que resolveria>
