# <Nome da Feature> — Ordem de Implementação

**Status:** Rascunho
**Data:** <hoje>

---

## Ordem de Implementação

> Implemente na sequência abaixo. Cada spec é independente ou declara sua dependência
> explicitamente. Não avance para a próxima spec sem os testes da spec atual passando.

| # | Spec | Arquivo | Depende de | Critério de avanço |
|---|------|---------|-----------|-------------------|
| 01 | [Nome da spec 01] | `specs/01-nome.md` | — | Testes da spec 01 passando |
| 02 | [Nome da spec 02] | `specs/02-nome.md` | spec 01 | Testes da spec 02 passando |
| 03 | [Nome da spec 03] | `specs/03-nome.md` | spec 01 | Testes da spec 03 passando |

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
