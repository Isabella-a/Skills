# <Nome da Feature> — Ordem de Implementação

**Status:** Rascunho
**Data:** <hoje>

---

## Ordem de Implementação

> Implemente na sequência abaixo. Cada spec é independente ou declara sua dependência
> explicitamente. Não avance para a próxima spec sem os testes da spec atual passando. Uma
> `Entrega vertical` com Verificação Manual na Tela só fecha quando essa verificação é
> confirmada, além dos testes passando.

| # | Spec | Arquivo | Depende de | Entrega vertical | Critério de avanço |
|---|------|---------|-----------|-------------------|-------------------|
| 01 | [Nome da jornada] | `specs/01-nome.md` | — | [nome da jornada] | Testes passando + verificação manual na tela |
| 02 | [Nome da spec 02] | `specs/02-nome.md` | — | Autônoma | Testes da spec 02 passando |

> Perfil `spec-harness`: cada entrega vertical vira um par (`specs/01-nome-backend.md` +
> `specs/02-nome-frontend.md`, a segunda com `Depende de: spec 01`) em vez de uma linha só.

---

## Dependências entre Specs

```
spec-01 (migration + entidade)   ──► spec-02 (endpoint de criação)
                                  └──► spec-03 (tela de listagem)
```

---

## Critério de Conclusão da Feature

```bash
# Comandos reais deste repositório — copie de `PROJECT_MAP.md § Stack & runtime`
# (build, lint, type-check e testes). Não invente comando que ninguém roda aqui.
<comando de build>
<comando de lint>
<comando de type-check>
<comando de testes>
```
