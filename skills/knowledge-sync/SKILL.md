---
name: knowledge-sync
description: Atualiza a base de conhecimento (`docs/knowledge/domains/*.md`, criada pela skill `knowledge-bootstrap`) e a convenção `mattpocock-skills:domain-modeling` (`CONTEXT.md`/`CONTEXT-MAP.md`, `docs/adr/`) a partir de uma spec SDD recém-implementada ou de uma branch/PR — extrai regras de negócio, vocabulário e decisões técnicas antes que a spec seja apagada, e mantém o índice (`INDEX.md`) coerente. Use quando o usuário disser "documenta essa spec antes de apagar", "atualiza a base de conhecimento com essa feature", "sincroniza o conhecimento dessa branch", "grava as regras de negócio dessa PR", ou logo após uma feature ser implementada/mergeada. NÃO use para o mapeamento inicial de um repositório novo — isso é `knowledge-bootstrap`.
---

# Knowledge Sync

Mantém a base de conhecimento atualizada, um incremento por vez, a partir de uma spec
implementada ou de uma branch/PR. Roda a cada entrega, não uma vez só — é o mecanismo que evita
que a base fique tão desatualizada quanto o `PROJECT_MAP.md` costuma ficar entre execuções, e é
o gatilho que falta na skill `domain-modeling` (feita para uma sessão de design ao vivo, não para
o momento em que uma spec está prestes a ser apagada).

Diferença central para o `knowledge-bootstrap`: aqui não há sessão longa de grilling. No máximo
4 perguntas pontuais via `AskUserQuestion`, só para o que é genuinamente ambíguo nesta entrega
específica — o resto se resolve lendo a spec/diff.

Esta skill escreve em três lugares diferentes, cada um já estabelecido, nunca inventa um quarto:
- **Regra de negócio** → `docs/knowledge/domains/<dominio>.md` (única convenção própria desta
  skill — ver `knowledge-bootstrap` para o porquê de existir separada de `domain-modeling`).
- **Vocabulário** → `CONTEXT.md`/`CONTEXT-MAP.md` do domínio (convenção `domain-modeling`).
- **Decisão técnica** → `docs/adr/` do domínio ou da raiz (convenção `domain-modeling`).

## Pré-requisito

```bash
ls docs/knowledge/INDEX.md 2>/dev/null
```

- **Não existe:** avise — "Não encontrei `docs/knowledge/INDEX.md`. Esta skill só atualiza uma
  base que já existe. Posso rodar `knowledge-bootstrap` primeiro?" — `AskUserQuestion`. Aceita →
  `Skill(skill: "knowledge-bootstrap")`, espera terminar, segue. Recusa → pare, não há onde
  gravar o incremento.
- **Existe:** siga.

## Passo 1 — Identifique a fonte

Nessa ordem, a primeira que existir:

1. **Caminho de spec dado pelo usuário**, ou uma pasta `.specs/sdd-<feature>/` (ou equivalente do
   repo) que bate com o nome da branch atual e ainda não foi apagada.
2. **Branch/commit-range**, se o usuário apontar ou se não houver spec: pin o diff contra o
   merge-base — `git merge-base origin/<base> HEAD` e `git diff <merge-base>...HEAD` — igual ao
   Phase 1 de um review de PR. Confirme que o diff não está vazio antes de prosseguir.

Se nenhuma das duas existir e o usuário não souber apontar nada, pergunte diretamente o que
sincronizar — não adivinhe uma branch.

## Passo 2 — Extraia o que é durável

Objetivo: separar o que vale a pena persistir do que é ruído de implementação.

- **Da spec** (`descricao_alto_nivel.md`, `specs/*.md`, `progresso.md` ou equivalente): requisitos
  de negócio, contratos, decisões de design que a spec tenha registrado.
- **Do diff**: cruze com a spec para confirmar **o que realmente foi implementado** — specs
  descrevem plano, o código é o que shippou. Diga explicitamente se algo da spec não bateu com o
  código (implementado diferente, ou não implementado) — isso é um achado, não um detalhe a
  esconder.
- **Da descrição da PR**, se houver (`gh pr view` quando aplicável) — normalmente tem o "porquê"
  de forma mais legível que o diff cru.

Classifique cada item extraído (mesma régua do `knowledge-bootstrap` Passo 1.3/1.4):
- **Regra de negócio nova ou alterada** → `docs/knowledge/domains/<dominio>.md`.
- **Termo de negócio novo, ou usado de forma diferente do já registrado** → `CONTEXT.md` do
  domínio (criar se ainda não existir, seguindo o formato de `domain-modeling`).
- **Decisão técnica que passa no critério de 3 testes** (difícil de reverter + surpreendente sem
  contexto + trade-off real) → ADR novo em `docs/adr/` do domínio ou da raiz.
- **Detalhe de implementação sem consequência de negócio/vocabulário/arquitetura** → não
  documente. Código e testes já são a fonte de verdade para isso; documentá-lo aqui é manutenção
  sem retorno.

## Passo 3 — Determine o(s) domínio(s) afetado(s)

Confira a tabela de domínios em `docs/knowledge/INDEX.md`. Domínio já existe → edite os arquivos
correspondentes (`domains/<dominio>.md` para a regra; `CONTEXT.md` do caminho já registrado para
o termo — nunca crie um `CONTEXT.md` novo se a linha já aponta para um existente). Marque regra
antiga como `superada por` se for o caso — nunca apague histórico de uma regra superada, troque o
status.

Domínio não existe ainda:
1. Crie `docs/knowledge/domains/<novo>.md` a partir de
   `../knowledge-bootstrap/templates/domain.md`.
2. Se o domínio também precisa de vocabulário próprio, crie o `CONTEXT.md` co-localizado com o
   código dele (mesmo critério do `knowledge-bootstrap` Passo 5) e, se o repositório for
   multi-contexto, adicione a entrada em `CONTEXT-MAP.md`.
3. Adicione a linha em `INDEX.md` (regras, vocabulário, ADRs, módulos de código, palavras-chave).

## Passo 4 — ADRs novos

Se o Passo 2 identificou uma decisão técnica que passa no critério de 3 testes:
1. Escaneie o diretório-alvo (`docs/adr/` do domínio, ou da raiz se for decisão de sistema) para
   o próximo número sequencial disponível.
2. Escreva `<diretório>/NNNN-<slug>.md` no formato enxuto de `domain-modeling`: título + 1-3
   frases de contexto/decisão/porquê. Só adicione "Status", "Alternativas consideradas" ou
   "Consequências" se agregarem valor real para este ADR específico — não é checklist.
3. Se este ADR for citado com frequência ou afetar vários domínios, adicione um link na seção
   "ADRs de sistema" de `INDEX.md`.
4. Se esta decisão **substitui** uma anterior, marque o ADR antigo como `superseded by ADR-NNNN`
   (frontmatter/linha de status) — não reescreva o conteúdo antigo além disso.

Nem toda mudança de código gera ADR — o critério de 3 testes existe justamente para filtrar. Na
dúvida, releia o critério no `knowledge-bootstrap`, Passo 1.4.

## Passo 5 — Perguntas pontuais (máximo 4)

Use `AskUserQuestion` só para o que ficou genuinamente ambíguo depois de ler spec + diff + PR —
por exemplo, "essa regra é permanente ou só vale até `<condição>` mudar?" ou "essa mudança
substitui a regra X documentada em `domains/y.md`, ou as duas coexistem?". Não reabra uma sessão
de grilling completa — se a lista de perguntas passar de 4, isso é sinal de que a entrega deveria
ter sido mais bem especificada antes de codar, não motivo para expandir esta skill.

## Passo 6 — Atualize o índice

Depois de gravar os arquivos, releia `docs/knowledge/INDEX.md` e confirme que:
- toda linha de domínio afetada reflete o estado atual (arquivo novo adicionado, caminhos de
  `CONTEXT.md`/`docs/adr/` corretos, palavras-chave atualizadas se a entrega introduziu um termo
  que valha grep).
- a seção "ADRs de sistema" só lista o que é citado com frequência — não vira um espelho de tudo
  que existe em `docs/adr/`.
- nenhum `domains/<dominio>.md` passou de ~300 linhas sem que você tenha avaliado dividir (ver
  critério no `knowledge-bootstrap`, Passo 5, regra 3) — se passou, divida agora, não adie.

## Passo 7 — Se a fonte era uma spec prestes a ser apagada

Avise explicitamente: "Capturei N regra(s) de negócio, M termo(s) de vocabulário e P decisão(ões)
técnica(s) de `.specs/sdd-<feature>/` na base de conhecimento. Posso apagar a pasta da spec
agora, ou prefere fazer isso você mesma?" — nunca apague `.specs/` (ou equivalente) sem essa
confirmação, mesmo tendo acabado de extrair o conteúdo dela. Apagar arquivos de spec é uma ação
destrutiva e fora do escopo desta skill por padrão.

## Passo 8 — Relatório final

Resumo curto: arquivos criados/editados (por convenção — `domains/`, `CONTEXT.md`, `docs/adr/`),
quantas regras/termos/ADRs novos, quaisquer divergências encontradas entre spec e código
implementado (Passo 2), e o que ficou `⚠️ ABERTO:` se sobrou alguma pergunta sem resposta
satisfatória.
