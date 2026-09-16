# QA Manual — <Nome da Funcionalidade>

**Data:** <hoje>
**Testado por:** <agente/sessão>
**Origem:** <caminho da spec `.specs/sdd-<feature>/specs/NN-*.md` | descrição livre recebida>
**Ambiente testado:** <URL local> · Chromium (Playwright)

---

## O que foi testado

<1-3 frases — o que esta funcionalidade faz, do ponto de vista de quem vai clicar>

---

## Como rodar localmente (para o colega repetir)

~~~bash
<comando de start, de PROJECT_MAP.md § Ambiente local e execução>
~~~

Acesse: `<URL>`

<Credenciais ou dado de teste necessário, se houver — nunca credencial real>

---

## Checklist de Teste Manual

> Print ao lado de cada passo é o resultado observado na execução automatizada — referência, não
> gabarito imutável: se a tela mudar depois, o comportamento descrito é o que vale.

### Cenário 1 — <nome, ex.: caminho feliz>

| # | Ação | Resultado esperado | Confirmado no Playwright |
|---|------|---------------------|---------------------------|
| 1 | <ação> | <o que deve acontecer> | ✅ / ❌ |
| 2 | <ação> | <o que deve acontecer> | ✅ / ❌ |

![Passo 1](./screenshots/01-cenario1-passo1.png)
![Passo 2](./screenshots/01-cenario1-passo2.png)

### Cenário 2 — <edge case>

| # | Ação | Resultado esperado | Confirmado no Playwright |
|---|------|---------------------|---------------------------|
| 1 | <ação> | <o que deve acontecer> | ✅ / ❌ |

![Passo 1](./screenshots/02-cenario2-passo1.png)

---

## Bugs Encontrados

| ID | Cenário | Severidade | Esperado | Obtido | Print |
|----|---------|-----------|----------|--------|-------|
| BUG-01 | <cenário, passo> | Alta/Média/Baixa | <o que deveria acontecer> | <o que aconteceu> | ![](./screenshots/bug-01.png) |

> Sem bugs encontrados nos cenários testados? Escreva isso — não omita a seção.

---

## Erros de Console Capturados

~~~
<saída relevante de console/pageerror durante os cenários, se houver — senão "Nenhum erro capturado">
~~~

---

## Cobertura

- RF/EC cobertos (se veio de spec SDD): <lista de IDs>
- ⚠️ Não testado: <o que ficou de fora e por quê — ex.: precisa de dado que não existe no ambiente>
