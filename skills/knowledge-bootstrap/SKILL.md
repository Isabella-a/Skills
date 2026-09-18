---
name: knowledge-bootstrap
description: Varredura inicial de um repositório para criar `docs/knowledge/` — o índice único de regras de negócio, amarrado ao vocabulário (`CONTEXT.md`/`CONTEXT-MAP.md`) e às decisões técnicas (`docs/adr/`) da skill `mattpocock-skills:domain-modeling`, feito para uma IA nunca precisar ler tudo. Roda o `mattpocock-skills:grilling` para fechar lacunas de regra de negócio/decisão técnica que não dá pra inferir do código. Use quando o usuário disser "cria a base de conhecimento do projeto", "gera o glossário do projeto", "bootstrap da documentação", "mapeia o projeto para a base de conhecimento", ou quando outra skill (ex. `knowledge-sync`) verificar que `docs/knowledge/INDEX.md` não existe e, com confirmação do usuário, chamar esta skill primeiro. Rode uma vez por repositório — depois disso, use `knowledge-sync` para manter atualizado.
---

# Knowledge Bootstrap

Cria, de uma vez só, uma base de conhecimento **centralizada, dividida e navegável** para um
repositório: `docs/knowledge/`. Ela captura o que o código sozinho não mostra — **regras de
negócio e decisões técnicas com seu porquê** — de um jeito que sobrevive à prática deste time de
**apagar specs depois de mergeadas**: se a regra não for capturada aqui antes da spec sumir, ela
se perde.

Só roda uma vez por repositório (ou quando o usuário pedir explicitamente uma refeita completa).
Depois do bootstrap, quem mantém a base atualizada é a skill `knowledge-sync`, chamada a cada
spec implementada ou branch/PR mergeada.

## Não reinventa o que já existe — divisão de responsabilidades

Este repositório (via plugin `mattpocock-skills`) já tem uma convenção pra vocabulário e decisão
técnica: a skill `domain-modeling` mantém `CONTEXT.md`/`CONTEXT-MAP.md` (glossário) e `docs/adr/`
(decisões, formato enxuto, critério de 3 testes para saber se vale um ADR). Outras skills deste
toolkit (`tdd`, `triage`) já leem esses arquivos como hábito. **Esta skill não cria um segundo
glossário nem uma segunda convenção de ADR concorrente** — quando o bootstrap precisa registrar
vocabulário ou uma decisão técnica, escreve exatamente nesses arquivos, no formato de
`domain-modeling` (ver Passo 5).

O que genuinamente falta nessa convenção existente, e que só esta skill (com `knowledge-sync`)
resolve — é por isso que ela existe, não é redundância:

1. **Regra de negócio.** `domain-modeling` é explícito: `CONTEXT.md` não é "spec, nem repositório
   de decisão de implementação" — só vocabulário. Uma regra como "receita fora da competência
   aberta precisa de aprovação do financeiro" não é um termo nem uma decisão técnica com
   trade-off; é uma regra de negócio, e não tem lugar nenhum documentado hoje. `domains/*.md` é
   esse lugar.
2. **Índice único navegável por palavra-chave.** `CONTEXT-MAP.md` lista contextos e como se
   relacionam, mas não é um roteador pensado para "onde eu leio X sem abrir o resto" — não tem
   uma coluna de palavras-chave para grep nem amarra vocabulário + ADR + regra de negócio num
   lugar só. `INDEX.md` é esse roteador (ver `templates/index.md`).
3. **O momento de captura antes da spec sumir.** Nada dispara `domain-modeling`
   automaticamente quando uma spec está prestes a ser apagada — é uma skill ativa, usada durante
   uma sessão de design ao vivo, não um gatilho de fim de entrega. `knowledge-sync` é esse
   gatilho: roda depois que uma spec foi implementada, cruza spec com o código que realmente
   shippou, e grava o que for durável (regra → `domains/`, decisão → `docs/adr/`, termo →
   `CONTEXT.md`) antes que a pasta da spec desapareça.

Se algum dia essas lacunas forem cobertas nativamente por `domain-modeling`/`grill-with-docs`,
esta skill deveria encolher ou sumir — não é para durar por si só, é para durar enquanto a lacuna
existir.

## Pré-requisitos

```bash
ls docs/knowledge/INDEX.md 2>/dev/null
```

- **Já existe:** avise o usuário — "`docs/knowledge/INDEX.md` já existe (gerado em <data> do
  índice). Rodar o bootstrap de novo reescreve a base inteira. Quer mesmo refazer do zero, ou
  prefere `knowledge-sync` para só atualizar com o que mudou desde então?" — e pare, a menos que
  o usuário confirme explicitamente a refeita.
- **Não existe:** siga o processo abaixo.

Também confira se `PROJECT_MAP.md` existe. Se não existir, ofereça rodar a skill `project-map`
primeiro (via `AskUserQuestion`) — o bootstrap aproveita o que ela já levantou sobre stack e
estrutura em vez de escanear tudo de novo. Se o usuário recusar, faça o levantamento de estrutura
você mesma (Passo 1) só o suficiente para identificar domínios — não precisa da profundidade de
`project-map`.

## Passo 1 — Levantamento de domínios (evidência, não suposição)

Mesmo princípio do `project-map`: toda afirmação tem origem rastreável. O que não dá pra
confirmar vira pergunta para o grilling (Passo 4), não um chute.

1. **Leia tudo que já existe primeiro** — não rescreva o que já está documentado, absorva:
   - `CLAUDE.md`/`AGENTS.md` (raiz e por app/workspace) — regras já estáveis, não copiar.
   - `PROJECT_MAP.md`, se existir — reaproveite §4 (arquitetura) e §11 (convenções) para entender
     a estrutura de módulos, sem duplicar o que já está lá.
   - `CONTEXT.md`/`CONTEXT-MAP.md` e `docs/adr/` já existentes — são a fonte de vocabulário e
     decisão técnica; leia antes de escrever `domains/*.md` pra não repetir o que já está lá.
   - ADRs em formato/local antigo, fora da convenção `domain-modeling` (ex.:
     `docs/architecture-decision-records/`) — **não migre automaticamente**; liste em `INDEX.md`
     como histórico não migrado (o usuário decide se/quando migrar).
   - Specs ainda não apagadas (`.specs/`, `specs/`, `docs/specs/` — o que o repo usar) — é a
     **última chance** de extrair regra de negócio dessas specs antes que sumam. Leia por
     inteiro as que existirem.
   - `git log --oneline -100` e descrições de PRs mergeados recentes, se acessíveis (`gh pr list
     --state merged --limit 30` quando há CLI de GitHub configurada) — decisões e regras às vezes
     só estão na descrição da PR, não no código.

2. **Identifique domínios/bounded-contexts** — normalmente já visíveis na estrutura de módulos do
   backend (`src/modules/<dominio>/` ou equivalente) ou nas telas/features do frontend. Onde a
   nomenclatura de backend e frontend não bate 1:1, decida o nome do domínio pelo vocabulário de
   negócio (não pelo nome técnico da pasta) e registre os dois caminhos de código na mesma linha
   de `INDEX.md`.

3. **Para cada domínio, junte candidatos a regra de negócio** lendo o código (validações,
   condicionais com nomes de regra, mensagens de erro ao usuário, comentários que já expliquem um
   "porquê") e cruzando com specs/PRs/ADRs do Passo 1.1. Regra encontrada só no código, sem o
   "porquê" confirmável em nenhum lugar → vira candidata a pergunta de grilling, não invenção.

4. **Junte candidatos a ADR e a termo de vocabulário** — decisões técnicas que claramente
   pesaram alternativas (critério de 3 testes abaixo), e termos de negócio usados de forma
   inconsistente ou não definidos em nenhum `CONTEXT.md` existente.

   **Critério para um ADR valer a pena** (os três precisam ser verdade — mesmo critério de
   `domain-modeling`): (1) difícil de reverter, (2) surpreendente sem contexto — alguém vai
   olhar o código e se perguntar "por que fizeram assim", (3) resultado de um trade-off real,
   com alternativa genuína descartada. Falta algum → não é ADR, é só o código fazendo o óbvio.

## Passo 2 — Rascunho da árvore antes de perguntar

Monte mentalmente (ou em rascunho local, não commitado) a lista de arquivos que vai gerar/editar:
`docs/knowledge/domains/<dominio>.md` por domínio identificado, `CONTEXT.md`/`CONTEXT-MAP.md`
novos ou a atualizar, `docs/adr/NNNN-slug.md` por ADR candidato. Isso define o escopo do grilling
do Passo 4 — pergunte sobre o que vai virar conteúdo, não sobre tudo que existe no repo.

## Passo 3 — O que já está confirmado não precisa de grilling

Se uma regra, termo ou decisão tem origem clara (spec ainda viva, ADR existente, PR bem descrito,
comentário explícito no código), **não pergunte** — documente direto com a origem citada.
Grilling é só para o que ficou como lacuna real depois do Passo 1.

## Passo 4 — Grilling para o que sobrou

Esta é a única etapa desta skill que interrompe o fluxo para uma conversa mais longa com o
usuário — e só acontece no bootstrap, nunca no `knowledge-sync`.

Chame `Skill(skill: "mattpocock-skills:grilling")` levando a lista de lacunas juntada nos passos
anteriores, organizada por domínio, como o ponto de partida da árvore de decisão que o grilling
vai trabalhar em rounds. Peça que foque em:
- **Porquês de negócio** sem origem confirmável (ex.: "por que o corte é no dia X do mês?").
- **Decisões técnicas** que parecem ADR-worthy (bateram no critério de 3 testes) mas sem contexto
  registrado (alternativas descartadas, motivo do trade-off).
- **Nomenclatura/vocabulário** ambíguo, usado de forma inconsistente entre partes do código, ou
  ausente de qualquer `CONTEXT.md` existente.

Não deixe o grilling se abrir para tópicos fora dessas lacunas — o objetivo é fechar o que falta
para escrever a base, não uma sessão livre de descoberta de produto. Fatos que dá pra achar no
próprio repositório (não decisão do usuário) são responsabilidade sua, não pergunta — o grilling
já segue essa regra sozinho, mas vale reforçar ao acionar.

Lacuna que sobra sem resposta mesmo depois do grilling vira `⚠️ ABERTO:` no arquivo final, com o
que resolveria — nunca é preenchida com suposição.

## Passo 5 — Escreva

```
docs/knowledge/
  INDEX.md                    ← templates/index.md — único arquivo novo de índice
  domains/
    <dominio>.md              ← templates/domain.md, um por domínio identificado no Passo 1.2
```

Vocabulário e decisões técnicas **não vivem em `docs/knowledge/`** — seguem exatamente a
convenção de `domain-modeling`:

- **Vocabulário:** um `CONTEXT.md` por contexto, co-localizado com o código desse domínio (ex.:
  `apps/backend/src/modules/<dominio>/CONTEXT.md`, ou a raiz do domínio equivalente neste repo).
  Repositório com mais de um contexto → `CONTEXT-MAP.md` na raiz listando todos. Formato: termo +
  1-2 frases + `_Avoid_` com sinônimos — ver a descrição de `domain-modeling` para o formato
  completo se tiver dúvida (`CONTEXT-FORMAT.md` daquela skill).
- **ADRs:** `docs/adr/` na raiz para decisão de sistema (afeta mais de um domínio), ou
  `<caminho-do-domínio>/docs/adr/` para decisão específica de um domínio. Numeração sequencial
  por diretório (`0001-slug.md`, `0002-slug.md`, ...) — escaneie o diretório-alvo para achar o
  próximo número, não reaproveite numeração de outro diretório. Formato enxuto: título + 1-3
  frases explicando contexto/decisão/porquê. Seções de "Status", "Alternativas consideradas" e
  "Consequências" são **opcionais**, só quando agregam valor real — não é checklist obrigatório.

Regras para o que fica em `docs/knowledge/`:
1. **Origem em cada afirmação não óbvia** — igual ao `project-map`: "regra X (origem: spec
   `02-aprovacao.md`, apagada em <data>)" ou "regra X (origem: grilling em <data>)".
2. **Não copie CLAUDE.md/AGENTS.md/PROJECT_MAP.md/CONTEXT.md/ADRs** — referencie pelo caminho.
3. **A tabela de domínios em `INDEX.md` é a parte mais importante do documento** — é o que evita
   que qualquer consumidor (IA ou humano) precise abrir a árvore inteira ou adivinhar em qual das
   três convenções (regra, vocabulário, ADR) uma informação está. Revise a coluna de
   palavras-chave com atenção: inclua termos que alguém realmente grepraria (nomes de bug
   corrigido, nomes de campo, termos de negócio), não só o nome do domínio.
4. **Arquivo sem conteúdo real vira "não se aplica" ou nem é criado** — não gere `domains/x.md`
   vazio "para completar".

## Passo 6 — Versionar e relatar

`docs/knowledge/`, `CONTEXT.md`/`CONTEXT-MAP.md` e `docs/adr/` devem ser versionados com o
repositório, igual ao `PROJECT_MAP.md`. Avise se notar que algo não está rastreado.

Ao final, mostre um resumo de 5-10 linhas: quantos domínios, quantos ADRs (novos e histórico não
migrado), quantos termos de vocabulário registrados/atualizados, quantas regras de negócio
capturadas, quantas lacunas ficaram `⚠️ ABERTO:`. Diga explicitamente: "`PROJECT_MAP.md` continua
em uso em paralelo por enquanto — a ideia é a base de conhecimento absorver o papel dele com o
tempo, não hoje." E lembre: a partir daqui, use `knowledge-sync` a cada spec implementada (antes
dela ser apagada) ou branch/PR mergeada.
