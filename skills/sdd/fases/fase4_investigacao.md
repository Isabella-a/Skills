# Fase 4 — Investigação do Repositório

Lance **dois agentes Explore simultaneamente**. Aguarde ambos antes de prosseguir para a Fase 5.

Antes de montar os prompts, releia `PROJECT_MAP.md`: os caminhos, camadas e padrões que ele
declara é que dizem **onde** os agentes devem olhar. Substitua os `<...>` abaixo por valores
concretos vindos dele — um prompt genérico devolve um relatório genérico.

---

## Agente A — Padrões do Repositório

```
Agent(
  subagent_type="Explore",
  description="Padrões do repositório para a feature $ARGUMENTS",
  prompt="""
  Escanear para entender os padrões que a nova feature deve seguir.

  1. Leia a documentação de agente da raiz (CLAUDE.md / AGENTS.md, se existirem) e
     PROJECT_MAP.md — regras arquiteturais, camadas e dependências proibidas.
  2. Localize a camada onde esta feature vai morar (<camadas declaradas no PROJECT_MAP.md>) e
     leia o exemplo mais próximo do que ela precisa fazer: como recebe entrada, como valida, como
     devolve erro, como persiste.
  3. Leia o tratamento de erro padrão do repositório (<padrão declarado no PROJECT_MAP.md>) e um
     exemplo de quem o consome — como o erro atravessa as camadas até a borda.
  4. Se a feature envolve efeito colateral (transação, fila, job, evento), leia um exemplo real
     desse mecanismo no repositório.
  5. Se a feature integra com serviço externo, leia o cliente/adaptador que já existe para ele —
     não reimplemente integração existente.

  Retorne:
  - Helpers, utilitários e padrões já existentes para reutilizar (com caminho e propósito)
  - Estrutura de testes no mesmo domínio (onde ficam, como se chamam, fixtures disponíveis)
  - O que NÃO deve ser reimplementado, com o caminho do que já resolve aquilo
  """
)
```

---

## Agente B — Precedentes e Docs Existentes

```
Agent(
  subagent_type="Explore",
  description="Módulos similares e docs existentes para a feature $ARGUMENTS",
  prompt="""
  Escanear para entender precedentes relevantes:

  1. Leia .specs/ — SDDs existentes: estrutura, granularidade e nível de detalhe já usados aqui.
  2. Procure módulos, telas ou jobs que resolvem um problema parecido com $ARGUMENTS:
     - Como resolveram o contrato (tipos, schemas, payloads)?
     - Como resolveram autorização, paginação, estado e concorrência, se aplicável?
     - Como resolveram validação e tratamento de erro?
  3. Existe SDD anterior para o mesmo domínio de $ARGUMENTS?

  Retorne:
  - Caminhos dos precedentes encontrados e como resolveram os principais desafios
  - SDDs existentes no mesmo domínio (se houver)
  - Decisões de design que se repetem e devem ser reutilizadas em vez de reinventadas
  """
)
```

---

## Consolidação

Ao receber os dois relatórios, registre para a Fase 5:

- **O que reusar** (com caminho) — cada item aqui é uma spec que não precisa existir.
- **O padrão a seguir** por tipo de artefato, para a spec não propor uma arquitetura paralela.
- **Divergências entre `PROJECT_MAP.md` e o código real.** Se o repositório contradiz o mapa, o
  código vence: corrija `PROJECT_MAP.md` e diga ao usuário o que mudou.
