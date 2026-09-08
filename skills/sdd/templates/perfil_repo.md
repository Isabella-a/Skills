# Perfil do repositório — SDD

> Gerado pela Fase -2 da skill `sdd` em <data>. Descreve **este repositório** para que as specs
> nasçam implementáveis. Versione este arquivo. Para refazer: rode a skill com `--setup` ou
> apague este arquivo.
>
> Regra de ouro: o que já está no `CLAUDE.md`/`AGENTS.md` não é copiado aqui — é referenciado.

## Identidade

- **Projeto:** <nome — o que ele faz, em uma frase>
- **Tipo:** <API | app web | app mobile | CLI | biblioteca | pipeline de dados | infra | outro>
- **Domínio:** <o assunto do negócio; o que um caso de borda relevante costuma envolver aqui>
- **Quem consome:** <usuário final, outro serviço, time interno, job agendado>

## Stack e ferramentas

| Item | Valor | Origem |
|---|---|---|
| Linguagem/runtime | <ex.: Python 3.12> | <manifesto lido> |
| Framework principal | <ex.: FastAPI> | <arquivo> |
| Testes | <framework + comando> | <manifesto/CI> |
| Lint / format / types | <comandos> | <config> |
| Migrations / schema | <ferramenta e diretório, ou "não se aplica"> | <arquivo> |
| CI | <workflow e o que ele exige para mergear> | <arquivo> |

## Estrutura e fronteiras

Onde o código realmente está (levantado com `git ls-files`, não suposto):

```
<árvore resumida, 2 níveis, só o que importa>
```

| O que criar | Onde vai |
|---|---|
| <artefato típico 1> | `<caminho>` |
| <artefato típico 2> | `<caminho>` |
| <teste de unidade> | `<caminho / convenção de nome>` |

**Dependências proibidas:** <ex.: domínio A não importa domínio B; camada de infra não importa
camada de rota. Se estiver no CLAUDE.md, referencie.>

**Escopos do `spec-harness`:** <lista de `scopes` do harness.config.json, ou "harness ainda não
inicializado neste repo">. Uma spec toca **um** escopo.

## Unidade de entrega — o que é "uma spec" aqui

<Uma frase objetiva. Ex.: "um caso de uso do domínio, com seu contrato de entrada/saída e seus
testes" ou "um endpoint com validação + persistência" ou "uma task do DAG com seu teste">

- **Isto é uma spec:** <exemplo real e pequeno, tirado do repo>
- **Isto é grande demais** (vira duas ou mais): <exemplo real>
- **Ordem típica entre specs:** <ex.: contrato → persistência → exposição HTTP → consumo na tela>

## Padrões obrigatórios

<O que o revisor cobra e o implementador precisa seguir. Cada item com um exemplo do repo ou uma
referência ao CLAUDE.md. Ex.: tratamento de erro, logging, injeção de dependência, validação de
entrada, tipagem, credenciais.>

## Testes

- **Sempre obrigatório:** <nível + o que precisa asserir para valer>
- **Obrigatório quando <condição>:** <nível — ex.: integração quando a mudança toca banco>
- **Como um teste é considerado válido aqui:** <ex.: verifica o ramo de erro explicitamente, não
  só "não lançou exceção">
- **Comando que o implementador roda:** `<comando>`

## Integrações externas recorrentes

| Serviço | Usado para | Caso de borda que a spec precisa cobrir |
|---|---|---|
| <serviço> | <uso> | <indisponibilidade, timeout, credencial inválida> |

## Fluxo de trabalho

- **Rastreador de issues:** <Jira (projeto/prefixo) | Linear | GitHub Issues | nenhum>
- **Convenção de branch/commit:** <padrão observado no `git log`>
- **O que o PR exige:** <gates de CI, revisão, cobertura>

## Em aberto

- ⚠️ ABERTO: <o que não foi possível confirmar e o que resolveria>
