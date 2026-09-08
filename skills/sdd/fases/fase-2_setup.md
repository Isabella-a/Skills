# Fase -2 — Setup do repositório (roda uma vez)

Esta skill não sabe nada sobre o repositório em que foi invocada. Sem isso, as fases seguintes
produzem specs genéricas demais para serem implementáveis: "crie o serviço" sem saber onde
serviços moram, o que é obrigatório num teste ali, ou o que conta como uma entrega fechada.

Esta fase resolve isso **uma única vez por repositório**, gravando `.claude/sdd/perfil.md`.
Todas as fases seguintes leem esse arquivo em vez de assumir uma stack.

---

## -2.0 — O perfil já existe?

```bash
cat .claude/sdd/perfil.md 2>/dev/null | head -40
```

- **Existe:** leia o arquivo inteiro, guarde o conteúdo para as fases seguintes e **pule para a
  Fase -1**. Não repita as perguntas.
- **Existe mas está desatualizado** (o usuário pediu `--setup`, disse que a estrutura mudou, ou
  você encontrou contradição flagrante entre o perfil e o repositório): refaça esta fase e
  sobrescreva o arquivo, avisando o que mudou.
- **Não existe:** siga para -2.1.

---

## -2.1 — Escaneie antes de perguntar

Pergunte só o que o repositório não responde sozinho. Levante, nesta ordem:

1. **Documentação de agente já existente** — é a fonte mais rica e a que o usuário já mantém:
   ```bash
   ls CLAUDE.md AGENTS.md .cursorrules CONTRIBUTING.md README.md 2>/dev/null
   ```
   Se houver `CLAUDE.md`/`AGENTS.md`, leia inteiro. Regras arquiteturais, "onde cada artefato
   vai" e convenções de teste normalmente já estão lá — **não duplique**: referencie.

2. **Perfil do spec-harness**, se o repo já foi inicializado:
   ```bash
   cat .claude/spec_harness/harness.config.json 2>/dev/null
   ```
   Dele saem de graça: `scopes` (as fronteiras que uma spec não pode cruzar),
   `source_extensions`, `test_markers`, comando de teste e validadores. Se existir, o perfil do
   SDD **tem de ser consistente com ele** — escopo declarado ali é escopo aqui.

3. **Manifesto e ferramentas**: `package.json`, `pyproject.toml`, `requirements*.txt`, `go.mod`,
   `pom.xml`, `Gemfile`, `Cargo.toml`, `composer.json` — linguagem, framework, scripts de teste
   e lint.

4. **Estrutura real**, não a imaginada:
   ```bash
   git ls-files | head -200
   git ls-files | awk -F/ 'NF>1 {print $1"/"$2}' | sort | uniq -c | sort -rn | head -30
   ```
   Isso mostra onde o código de fato está e quais diretórios concentram mudança.

5. **Testes**: onde ficam, como se chamam (`test_*.py`, `*.spec.ts`, `*_test.go`), se são
   co-localizados ou em árvore separada, e se há níveis distintos (unit / integração / e2e).

6. **CI e gates**: `.github/workflows/*`, `.gitlab-ci.yml`, `Makefile` — o que precisa passar
   para um PR mergear (cobertura mínima, lint, typecheck).

7. **Rastreador de issues**: remotes do git, referências a Jira/Linear/GitHub Issues em
   `CONTRIBUTING.md`, prefixos de chave em `git log --oneline -30`.

---

## -2.2 — Pergunte o que sobrou

Use `AskUserQuestion`, **no máximo 4 perguntas por chamada**, e só sobre o que o escaneamento
não resolveu. Para cada pergunta, mostre o que você inferiu e peça confirmação em vez de
perguntar do zero — é mais rápido para o usuário corrigir do que descrever.

Os eixos que precisam estar respondidos ao fim desta fase:

| Eixo | Por que a skill precisa disso |
|---|---|
| **Tipo de projeto e domínio** | API, app web, CLI, biblioteca, pipeline de dados, infra — muda o que é um contrato e o que é um caso de borda relevante |
| **Camadas e fronteiras** | Onde cada tipo de artefato mora e quais dependências são proibidas — é o que impede uma spec de atravessar módulos |
| **Unidade de entrega** | O que conta como "uma spec" ali: um endpoint? um caso de uso? uma tela? um DAG? Sem isso a Fase 3 fatia errado |
| **Padrões obrigatórios** | Tratamento de erro, logging, injeção de dependência, validação de entrada — o que o revisor cobra |
| **Testes obrigatórios** | Quais níveis são exigidos por tipo de mudança, e o que um teste precisa asserir para valer |
| **Integrações externas recorrentes** | Quais serviços a maioria das features toca — alimenta os casos de borda de indisponibilidade |
| **Fluxo de trabalho** | Rastreador de issues (se houver), convenção de branch, o que o PR exige |

Perguntas que **não** devem ser feitas aqui: nada específico da feature que o usuário quer
construir. Esta fase é sobre o repositório; a feature começa na Fase -1.

---

## -2.3 — Escreva o perfil

Use `templates/perfil_repo.md` e grave em `.claude/sdd/perfil.md`.

Regras ao escrever:

1. **Registre a origem de cada afirmação.** "Serviços ficam em `src/services/` (visto em
   `git ls-files`)" vale; "Serviços ficam em `src/services/`" sem lastro vira lenda que as
   próximas 20 specs vão repetir.
2. **Não copie o `CLAUDE.md`.** Se a regra já está lá, escreva "ver `CLAUDE.md § Regras de
   Código`" — documentação duplicada diverge.
3. **Marque o que ficou incerto** com `⚠️ ABERTO:` e diga o que resolveria. A Fase 2 pode
   fechar a lacuna investigando o código, e o `spec-harness` recusa spec com `⚠️ ABERTO:`
   pendente.
4. **Seja concreto sobre a unidade de entrega.** É o campo que mais afeta a qualidade das specs
   geradas: escreva um exemplo real de "isto é uma spec" e um de "isto é grande demais".

Ao terminar, mostre um resumo de 5 linhas ao usuário e diga como refazer: rodar a skill com
`--setup` ou apagar `.claude/sdd/perfil.md`.

---

## -2.4 — Versionar

`.claude/sdd/perfil.md` **deve ser versionado com o repositório**: ele descreve o projeto, não a
máquina. Se `.claude/` estiver no `.gitignore`, avise o usuário — sem versionar, cada
desenvolvedor (e cada agente) responde as perguntas de novo e as respostas divergem.
