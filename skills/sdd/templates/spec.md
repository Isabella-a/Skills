# Spec NN — <Nome da Spec>

**Status:** 🟡 Rascunho
**Autor:** <git config user.name>
**Data:** <hoje>
**Escopo:** <escopo do `spec-harness` que esta spec toca — uma spec toca UM escopo>
**Depende de:** [spec anterior ou "Nenhuma"]

---

## Resumo

[1–3 frases. O que esta spec entrega? Por que é uma unidade separada?]

---

## Contexto

[Por que esta spec existe? O que ela habilita nas specs seguintes?]

---

## Arquivos permitidos

Qualquer arquivo fora desta lista é expansão de escopo: pare e alinhe antes de commitar.
Esta seção é lida pelo `spec-harness` (`scaffold-packet`) — mantenha os dois blocos abaixo, com
um bullet por arquivo.

**Produção (fase GREEN)**

- `<caminho/do/arquivo>` — <o que muda ali> *(marque `(novo)` quando o arquivo ainda não existe)*

**Testes (fase RED)**

- `<caminho/do/teste>` *(novo)*

**Proibido tocar:**

- <caminhos que esta spec não pode alterar, tipicamente outros escopos>

---

## Requisitos Funcionais

> Cada RF é atômico e testável isoladamente.
> Formato: RF-XX — [O sistema/endpoint/componente] deve [verbo concreto] [complemento].
> Todos os itens com 🟡 — "pendente de validação". A implementação troca por ✅.

| ID | Requisito | Prioridade | Critério de Aceite |
|----|-----------|-----------|-------------------|
| 🟡 RF-01 | [O sistema deve...] | Must | [Condição verificável e objetiva] |
| 🟡 RF-02 | [O sistema deve...] | Must | [Condição verificável e objetiva] |
| 🟡 RF-03 | [O sistema deve...] | Should | [Condição verificável e objetiva] |

> Prioridades: **Must** (obrigatório) / **Should** (importante, negociável) / **Could** (nice-to-have)

---

## Comportamento Esperado

> Descreva o QUÊ acontece, não o COMO implementar.
> Escreva como se um desenvolvedor ou agente fosse implementar sem poder perguntar nada.
> Se não tiver certeza de algo, marque com ⚠️ ABERTO: e registre nas Open Questions — o
> `spec-harness` recusa spec com marcador aberto pendente.

### Fluxo Principal (Happy Path)

1. [O que acontece — perspectiva do sistema]
2. [Próximo passo]
3. Resultado: [estado final observável]

### Fluxos Alternativos

**Fluxo Alternativo A — [Nome]:**
1. [Passo divergente]
2. [Comportamento específico]

---

## Contratos

> A interface pública que esta spec cria ou altera — é o que uma spec dependente lê (via
> `Depende de`) em vez de ler a implementação inteira. Wrapper fino, sem lógica, não precisa
> aparecer aqui.
>
> Use a **linguagem e o formato de assinatura do repositório** (ver `.claude/sdd/perfil.md`).
> Ao final do GREEN, atualize as assinaturas para o que foi realmente implementado e troque 🟡
> por ✅.

**`<caminho/do/arquivo>` — `<nome da função/classe/endpoint>`** 🟡

```
<assinatura na linguagem do repositório>

Entrada:   <tipo/schema — campos e obrigatoriedade>
Saída:     <tipo/schema no caso de sucesso>
Erros:     <cada erro possível e a condição que o produz>
Efeitos:   <persistência, evento, chamada externa — e em que ordem/transação>
```

**Borda (se a spec expõe algo para fora):** 🟡

```
<mapeamento de erro para o protocolo de saída — ex.: erro de domínio → status HTTP,
código de saída de CLI, mensagem na fila de dead-letter>
```

---

## Edge Cases e Tratamento de Erros

| ID | Cenário | Trigger | Comportamento esperado |
|----|---------|---------|----------------------|
| 🟡 EC-01 | [Nome do edge case] | [O que causa] | [O que o sistema deve fazer] |
| 🟡 EC-02 | [Entrada inválida] | [Condição] | [Erro esperado / mensagem de validação] |
| 🟡 EC-03 | [Dependência externa indisponível] | [Condição] | [Propagação explícita — sem captura silenciosa] |

---

## Casos de Teste Mínimos

> Cada linha aqui é um teste que precisa existir **antes** do código (fase RED do
> `spec-harness`). Os níveis obrigatórios vêm de `.claude/sdd/perfil.md § Testes`.

| # | Alvo | Cenário | Fixture de entrada | Resultado esperado | Arquivo de teste |
|---|------|---------|---------------------|---------------------|-------------------|
| 🟡 T-01 | `<unidade>` | caminho feliz | `<fixture>` | `<saída esperada>` | `<caminho do teste>` |
| 🟡 T-02 | `<unidade>` | <condição de erro> | `<fixture>` | `<erro esperado>` | `<caminho do teste>` |
| 🟡 T-03 | `<unidade>` | <borda / integração, se o perfil exigir> | `<fixture>` | `<resultado>` | `<caminho do teste>` |

### Shape das fixtures

```
// Tipos nativos da linguagem do repositório. Nomes de campos idênticos ao contrato real —
// fixture com campo inventado é o erro mais comum e mais caro desta seção.

<fixture mínima>
<resultado esperado>
```

### Critério de aceite

```bash
<comando de teste do repositório, escopado aos arquivos desta spec>
```

---

## Checklist de Implementação

> Os itens específicos de stack saem de `.claude/sdd/perfil.md § Padrões obrigatórios`.
> Substitua os `<...>` na geração da spec — checklist genérico não é cobrado por ninguém.

- [ ] 🟡 Antes de commitar: `git diff --stat` conferido contra **Arquivos permitidos**. Arquivo
      fora da lista → parar e alinhar, não expandir o escopo em silêncio.
- [ ] 🟡 Testes escritos antes do código (fase RED)
- [ ] 🟡 <padrão de contrato/tipagem do repositório>
- [ ] 🟡 <padrão de validação de entrada do repositório>
- [ ] 🟡 Fail-first: nenhum erro de negócio engolido por captura silenciosa
- [ ] 🟡 <padrão para efeito colateral / transação, se aplicável>
- [ ] 🟡 Helpers e componentes existentes reutilizados em vez de reimplementados
- [ ] 🟡 <regras de tipagem/lint que o repositório cobra>

---

## Open Questions

> Dúvidas não resolvidas. Marque com ⚠️ ABERTO: no corpo do texto onde a ambiguidade aparece —
> é isso que impede a spec de ser implementada com premissa inventada.

| # | Pergunta | Impacto | Dono | Prazo |
|---|---------|---------|------|-------|
| OQ-01 | [Pergunta] | Alto/Médio/Baixo | [Nome] | [data] |

---

## Aderência Arquitetural

> Uma linha por regra que o repositório cobra (do `perfil.md` e do `CLAUDE.md`/`AGENTS.md`).
> Regra que não se aplica a esta spec: `N/A` com o motivo.

| Regra | Status | Justificativa |
|-------|--------|---------------|
| <regra 1 do repositório> | 🟡 | — |
| <regra 2 do repositório> | 🟡 | — |
| Fail-first: nenhuma captura silenciosa | 🟡 | — |
| Escopo respeitado: nada fora de **Arquivos permitidos** | 🟡 | — |
