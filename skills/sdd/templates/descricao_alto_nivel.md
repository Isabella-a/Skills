# <Nome da Feature> — Descrição de Alto Nível

**Status:** Rascunho
**Autor:** <git config user.name>
**Data:** <hoje>
**Branch:** <branch atual>
**Escopos tocados:** <escopos do `spec-harness` que a feature atravessa — um por spec>
**Ticket:** <ABC-1234 — omitir esta linha se a feature não veio de um ticket>

---

## Objetivo

[2–4 frases: o que esta feature entrega, para quem, e qual problema resolve.
Seja concreto — referencie módulos, telas ou fluxos que existem neste repositório.]

---

## Comportamento Esperado (Feature Completa)

[Descreva o que a feature faz do ponto de vista de quem consome.
Descreva o QUÊ acontece, não o COMO é implementado.
Use fluxo narrativo: "Quando X, o sistema Y, resultando em Z."]

---

## Não-objetivos

- [O que esta feature explicitamente NÃO faz]
- [O que pode vir depois, mas não agora]

---

## Contratos e Schemas

> Preencha com o resultado real da Fase 1. Nada aqui pode ser inventado: cada shape vem com o
> caminho do arquivo onde ele foi lido.

### Fonte: <entidade persistida / contrato de I/O / serviço externo / schema de entrada>

**Origem:** `<caminho/do/arquivo>`

**Shape real:**
```
<notação da linguagem do repositório>

campoA: <tipo>          // ex: "12345" — sempre preenchido
campoB: <tipo>          // ex: 42
campoC: <tipo> | null   // ex: 1234.56 — null quando <condição real>
```

**Casos de borda conhecidos:**
- `campoC` é nulo quando [condição]
- A resposta pode vir vazia quando [condição]

### Mudança de schema (se aplicável)

```
// <caminho da migration/DDL, no mecanismo que o repositório usa>
// Campos novos/alterados em <tabela ou coleção>
```

### Contratos de entrada (se aplicável)

```
// <caminho do arquivo>
<tipo/schema com as regras de validação declaradas>
```

---

## Arquitetura da Feature

> Use as camadas que `.claude/sdd/perfil.md § Estrutura e fronteiras` declara. Uma linha por
> artefato que a feature cria ou altera.

| Camada | Artefato | Caminho | Escopo |
|--------|----------|---------|--------|
| <camada> | <o que é criado/alterado> | `<caminho>` | <escopo do harness> |

### Fluxo ponta a ponta

```
<origem do estímulo> → <camada 1> → <camada 2> → <resultado observável>
<o que acontece em caso de erro, em cada ponto onde ele pode surgir>
```

---

## Dependências e Reutilização

### O que já existe e deve ser reutilizado

| Item | Caminho | Como usar |
|------|---------|-----------|
| <helper/módulo/componente levantado na Fase 2> | `<caminho>` | <uso> |

### Novas dependências externas

[Liste qualquer client novo, biblioteca nova ou serviço novo — e justifique por que o que já
existe no repositório não cobre. Dependência nova sem justificativa é sinal de que a Fase 2 não
foi feita direito.]

---

## Open Questions

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | [Pergunta em aberto] | Alto/Médio/Baixo | [Nome] | [data] |

---

## Tabela de Rastreabilidade

| Spec | Onde será implementada | RFs cobertos |
|------|------------------------|-------------|
| [01-NomeSpec] | `<caminho principal>` | RF-01, RF-02 |
