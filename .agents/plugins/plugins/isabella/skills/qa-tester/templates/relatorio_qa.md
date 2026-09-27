# QA Manual — <Nome da Funcionalidade>

## Checklist de Teste Manual

> Print ao lado de cada passo é o resultado observado na execução automatizada — referência, não
> gabarito imutável: se a tela mudar depois, o comportamento descrito é o que vale.

### Cenário 1 — <nome, ex.: caminho feliz>

| # | Ação | Resultado esperado | Confirmado na tela |
|---|------|---------------------|---------------------------|
| 1 | <ação> | <o que deve acontecer> | ✅ / ❌ |
| 2 | <ação> | <o que deve acontecer> | ✅ / ❌ |

![Passo 1](./screenshots/01-cenario1-passo1.png)
![Passo 2](./screenshots/01-cenario1-passo2.png)

### Cenário 2 — <edge case>

| # | Ação | Resultado esperado | Confirmado na tela |
|---|------|---------------------|---------------------------|
| 1 | <ação> | <o que deve acontecer> | ✅ / ❌ |

![Passo 1](./screenshots/02-cenario2-passo1.png)

---

## Bugs Encontrados

| ID | Cenário | Severidade | Esperado | Obtido | Print |
|----|---------|-----------|----------|--------|-------|
| BUG-01 | <cenário, passo> | Alta/Média/Baixa | <o que deveria acontecer> | <o que aconteceu> | ![](./screenshots/bug-01.png) |

> Sem bugs encontrados nos cenários testados? Escreva isso — não omita a seção.
> Bug cujo comportamento observado contradiz uma regra em `docs/knowledge/domains/*.md`: cite a
> RN divergente na coluna "Esperado" (ex.: "diverge de RN-CONTA-009") e sugira ao usuário rodar
> `knowledge-sync` depois — não edite a doc de conhecimento a partir daqui.

---

## Erros de Console Capturados

~~~
<saída relevante de console/pageerror durante os cenários, se houver — senão "Nenhum erro capturado">
~~~

---

## Cobertura

- RF/EC cobertos (se veio de spec SDD): <lista de IDs>
- ⚠️ Não testado: <o que ficou de fora e por quê — ex.: precisa de dado que não existe no ambiente>
