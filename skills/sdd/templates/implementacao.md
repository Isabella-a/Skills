# <Nome da Feature> — Ordem de Implementação

**Status:** Rascunho
**Data:** <hoje>

---

## Ordem de Implementação

> Implemente na sequência abaixo. Cada spec é independente ou declara sua dependência
> explicitamente. Não avance para a próxima spec sem os testes da spec atual passando. Um par
> backend+frontend da mesma `Entrega vertical` só fecha quando a spec de frontend passa **e**
> a Verificação Manual na Tela dela é confirmada.

| # | Spec | Arquivo | Depende de | Entrega vertical | Critério de avanço |
|---|------|---------|-----------|-------------------|-------------------|
| 01 | [Nome — backend] | `specs/01-nome-backend.md` | — | [nome da entrega] | Testes da spec 01 passando |
| 02 | [Nome — frontend] | `specs/02-nome-frontend.md` | spec 01 | [nome da entrega] | Testes da spec 02 passando + verificação manual na tela |
| 03 | [Nome da spec 03] | `specs/03-nome.md` | — | Autônoma | Testes da spec 03 passando |

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
