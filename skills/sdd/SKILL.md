---
name: sdd
description: Quebra uma entrega em specs construíveis — documentos de Spec-Driven Design, um por unidade implementável e testável. Use quando o usuário quiser especificar antes de implementar, pedir "escreve um spec", "cria um SDD", "spec-driven design", "planejar essa feature/tarefa antes de codar", ou quiser fixar contratos e casos de teste antes do código. Aceita descrição livre OU referência a um ticket (chave tipo ABC-1234 ou link do rastreador). Na primeira execução num repositório, garante que PROJECT_MAP.md existe (skill 'project-map') e grava .claude/sdd/perfil.md com a unidade de entrega deste repositório. Produz .specs/sdd-<feature>/ com descricao_alto_nivel.md, implementacao.md, progresso.md e specs/NN-<nome>.md — consumidos depois pela skill 'spec-harness', que implementa cada spec com enforcement.
argument-hint: <descrição da feature | chave/link do ticket | --setup>
allowed-tools: [Read, Glob, Grep, Bash, Agent, AskUserQuestion, Write, Skill]
---

# Spec-Driven Design (SDD) — Orquestrador

Você está quebrando uma entrega em **specs construíveis**: cada uma é a menor mudança que dá
para implementar e provar com teste, com contrato explícito e critérios de aceite verificáveis.
O resultado dá ao implementador (humano ou agente) tudo o que ele precisa para escrever os
testes **antes** do código.

O usuário invocou com: **$ARGUMENTS**

`$ARGUMENTS` pode ser uma descrição livre, uma referência a um ticket (chave `ABC-1234`, só o
número, ou um link do rastreador) ou `--setup` para refazer a unidade de entrega em
`.claude/sdd/perfil.md` (para regenerar `PROJECT_MAP.md`, use `--refresh` na skill `project-map`).

A saída é uma pasta `.specs/sdd-<feature-slug>/`, consumida depois pela skill `spec-harness`,
que implementa cada spec num worktree isolado com enforcement de path — o SDD **não** escreve
código de produção.

---

## Fluxo de execução

Execute as fases **na ordem abaixo**. Cada fase tem seu arquivo de instruções — leia o arquivo
antes de executar a fase. Os caminhos são relativos a este diretório de skill.

| Fase | Arquivo | O que faz | Pré-requisito |
|------|---------|-----------|---------------|
| -2 | `fases/fase-2_setup.md` | **Só na primeira vez no repositório** (ou com `--setup`): garante `PROJECT_MAP.md` (delegando à skill `project-map` se faltar) e grava `.claude/sdd/perfil.md` com a unidade de entrega | — |
| -1 | `fases/fase-1_ticket_grilling.md` | Busca o ticket (se houver referência) e roda uma sessão de grilling para afiar a ideia antes de qualquer pergunta estruturada | Fase -2 concluída |
| 0 | `fases/fase0_alinhamento.md` | Coleta objetivo e regras de negócio; reaproveita o que a Fase -1 já resolveu e só pergunta o que ficou em aberto | Fase -1 concluída |
| 1 | `fases/fase1_exploracao.md` | Explora o shape real de contratos, schemas e entidades envolvidos | Fase 0 concluída |
| 2 | `fases/fase2_investigacao.md` | Investiga os padrões do repositório e módulos similares | Fase 0 concluída (paralela com a Fase 1) |
| 3 | `fases/fase3_confirmacao.md` | Deriva a lista de specs (granularidade + reuso) e confirma o escopo técnico | Fases 1 e 2 concluídas |
| 4 | `fases/fase4_geracao.md` | Gera a pasta `.specs/sdd-<slug>/` com todos os arquivos | Fase 3 concluída |

---

## Arquivos de referência

| Arquivo | Quando usar |
|---------|-------------|
| `PROJECT_MAP.md` (no repo alvo, gerado pela skill `project-map`) | Stack, arquitetura, estilos, testes, CI/deploy, segurança, convenções — leia **antes de tudo**; é o que ancora as fases numa stack real |
| `.claude/sdd/perfil.md` (no repo alvo) | Só a unidade de entrega deste repositório — complementa `PROJECT_MAP.md` |
| `templates/perfil_repo.md` | Template do perfil (usado na Fase -2) |
| `exploracao_contratos.md` | Prompt do agente de exploração (usado na Fase 1) |
| `templates/descricao_alto_nivel.md` | Template para `descricao_alto_nivel.md` (Fase 4) |
| `templates/implementacao.md` | Template para `implementacao.md` (Fase 4) |
| `templates/progresso.md` | Template para `progresso.md` (Fase 4) |
| `templates/spec.md` | Template para cada arquivo em `specs/` (Fase 4) |
| `regras/qualidade.md` | Regras e anti-padrões — leia antes de escrever qualquer spec |
| `referencias/spec_template.md` | Template RFC de referência — base estrutural |
| `referencias/sdd_guide.md` | Guia de metodologia SDD — para dúvida conceitual |
| skill de grilling (ex.: `grilling`, do plugin `mattpocock-skills`) | Entrevista o usuário em rounds até a ideia estar afiada (Fase -1) |
| skill/MCP do rastreador de issues, se houver | Busca o ticket quando `$ARGUMENTS` traz chave ou link (Fase -1) |

---

## Regras globais

1. **Não pule fases.** Cada fase alimenta a seguinte — pular produz specs com contratos
   inventados ou escopo errado.
2. **Leia `PROJECT_MAP.md` (arquitetura, stack, convenções) e `.claude/sdd/perfil.md` (unidade de
   entrega) antes da Fase 0.** É o que impede esta skill de propor uma arquitetura que não é a
   do repositório. Se algum dos dois não existir, rode a Fase -2 primeiro.
3. **Fases 1 e 2 podem rodar em paralelo** (ambas dependem só da Fase 0).
4. **Leia o arquivo de instruções da fase antes de executá-la** — as instruções estão nos
   arquivos acima, não neste orquestrador.
5. **Leia `regras/qualidade.md` antes de escrever qualquer spec** na Fase 4.
6. **Nunca invente contrato, DTO, entidade ou schema.** Se a Fase 1 não retornou o shape real,
   resolva os GAPS antes de continuar — ou registre `⚠️ ABERTO:` na spec, que é o que faz o
   `spec-harness` recusar a implementação.
7. **A granularidade sai do perfil, não do seu gosto.** O campo "unidade de entrega" do
   `perfil.md` define o que é uma spec neste repositório; a Fase 3 aplica isso.
8. **A Fase -1 é obrigatória em toda invocação**, com ou sem ticket — a busca do ticket é o
   único passo opcional dela. Não pule para a Fase 0 achando a descrição "clara o suficiente":
   quem decide isso é a sessão de grilling.
9. **Não duplique lógica de outra skill.** Busca de issue e entrevista são delegadas às skills
   correspondentes quando existirem; a Fase -1 só orquestra as chamadas.
10. **Depois de gerar a pasta**, avise que a implementação acontece via `spec-harness`
    (`scaffold-packet` + `autorun`), não escrevendo código direto a partir do SDD.
