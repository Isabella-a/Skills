# Base de Conhecimento

> Gerada pela skill `knowledge-bootstrap` em <data>, no commit `<git rev-parse --short HEAD>`.
> Mantida a partir daí pela skill `knowledge-sync`, chamada ao final de cada spec implementada
> ou branch/PR mergeada. Este arquivo é o **glossário/roteador**: a única leitura obrigatória.
>
> Esta base não duplica vocabulário nem decisões técnicas — isso já mora em `CONTEXT.md` /
> `CONTEXT-MAP.md` e `docs/adr/` (convenção da skill `mattpocock-skills:domain-modeling`, já
> usada por outras skills deste toolkit). O que só existe aqui: **regras de negócio** por
> domínio (`domains/*.md`) e o **índice único** que amarra as três fontes (vocabulário, ADRs,
> regras) para uma IA nunca precisar abrir tudo pra achar uma resposta.

## Como navegar sem gastar tokens

1. Leia só esta seção + a tabela de domínios abaixo. Não abra `domains/*.md`, `CONTEXT.md`s ou
   ADRs "por precaução".
2. Sabe o domínio? Vá direto à linha dele na tabela — ela te manda pro arquivo certo conforme o
   tipo de informação que você precisa (vocabulário vs. regra vs. decisão).
3. Não sabe o domínio, só uma palavra-chave? `grep -in "<palavra>" docs/knowledge/INDEX.md` — a
   coluna de palavras-chave existe pra isso.
4. Precisa do porquê de uma decisão técnica? Vá direto pro `docs/adr/` (ou
   `<contexto>/docs/adr/`) indicado na linha do domínio — não abra os ADRs todos, os nomes de
   arquivo (`NNNN-slug.md`) já dizem do que se trata.
5. Um `domains/<dominio>.md` ficou grande (> ~300 linhas)? Sinal pra próxima `knowledge-sync`
   dividir (`domains/<dominio>/regras-cadastro.md`, `domains/<dominio>/regras-aprovacao.md` etc.)
   e atualizar a tabela abaixo.

## Quando sua tarefa envolve...

| Sua tarefa é sobre... | Leia |
|---|---|
| Regra de negócio ou fluxo de um domínio específico | `domains/<dominio>.md` — ache na tabela abaixo |
| Vocabulário/significado de um termo de negócio | `CONTEXT.md` do domínio — ache o caminho na tabela abaixo |
| Por que uma decisão técnica foi tomada (trade-off, alternativa descartada) | `docs/adr/` do domínio (ou raiz, se for decisão de sistema) — ache o caminho na tabela abaixo |
| Estrutura de arquivos/stack/CI genérica (não é o foco desta base) | `PROJECT_MAP.md` (raiz), enquanto existir |

## Domínios

> Uma linha por domínio/bounded-context. Cada coluna aponta pra onde aquele tipo de informação
> realmente vive — esta tabela é o único lugar que precisa saber isso de cor.

| Domínio | Regras de negócio | Vocabulário (CONTEXT.md) | ADRs (docs/adr/) | Módulos de código | Palavras-chave |
|---|---|---|---|---|---|
| <ex.: Cobrança> | `domains/<dominio>.md` | `<caminho>/CONTEXT.md` | `<caminho>/docs/adr/` | `<caminhos de código>` | <termos> |

## ADRs de sistema (afetam mais de um domínio)

`docs/adr/` na raiz (se existir) ou `CONTEXT-MAP.md` para a lista completa de contextos e como se
relacionam. Não repita aqui — só linke se um ADR de sistema for citado com frequência:

- <link> — <título>

## ADRs pré-existentes fora desta convenção

> Se o repositório já tinha ADRs em outro formato/local antes desta base (ex.:
> `docs/architecture-decision-records/`), eles **não são migrados automaticamente** — ficam
> listados aqui como histórico até alguém decidir migrar.

- `<caminho antigo>` — <do que trata, resumido> (não migrado)

## Seções sem conteúdo ainda

<lista gerada no bootstrap — ex.: "nenhum domínio de X documentado ainda" — ou remova esta seção
se não houver lacunas conhecidas>

## Em aberto (⚠️)

<perguntas que sobraram sem resposta após o grilling, com o que resolveria cada uma>
