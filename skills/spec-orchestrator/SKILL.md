---
name: spec-orchestrator
description: Implementa todas as specs de uma feature SDD (.specs/sdd-<feature>/) direto — um subagente lean por spec lê a spec.md, escreve o teste (RED) e o código (GREEN) na mesma sessão, isolado por git worktree, em paralelo quando specs não dependem entre si e em sequência quando dependem. Antes do merge rodam checagens mecânicas baratas (escopo, lint, contrato, cobertura de requisito) via Bash/grep, sem custar token de LLM, e uma correção é pedida de volta ao mesmo subagente antes de desistir. Sem packet YAML, sem evidence.json, sem gates automáticos, sem PROJECT_MAP.md inteiro por fase — o objetivo é gastar pouco token por spec. Use quando o usuário quiser "implementar a feature inteira" priorizando custo baixo.
allowed-tools: [Read, Glob, Grep, Bash, Edit, Agent, SendMessage]
---

# Spec Orchestrator (lean)

Motor próprio, sem depender de nenhuma outra skill de execução: o subagente lê a spec Markdown
direto e implementa. O que importa é TDD (teste antes do código), isolamento por spec, e um gate
mínimo antes do merge — mecânico (Bash/grep), não uma sessão de LLM.

Isolamento é **entre specs** (uma spec não vê o worktree/sessão de outra), não dentro de uma spec:
teste e código da mesma spec saem da **mesma** sessão de subagente, na ordem RED→GREEN — abrir
duas sessões por spec (uma só pra teste, outra só pro código) pagaria o contexto frio duas vezes
pelo mesmo trabalho, o oposto do que se quer aqui.

Esta skill não invoca nenhuma outra skill sozinha. Se o usuário quiser o fluxo com enforcement
mecânico em tempo real (hook de path, packet, evidence.json), isso só roda se ele digitar
`/spec-harness` explicitamente — não é acionado por esta.

## Runtime: Claude Code e Codex

Faça a mesma orquestração usando a primitiva de subagente do runtime atual. No Claude Code, uma
onda usa `Agent`/`Task` e a correção retorna por `SendMessage`. No Codex, use `spawn_agent` para
cada spec independente, `wait_agent` para coletar o resultado e `followup_task` para devolver uma
correção ao mesmo agente. Sem subagentes, execute as specs em sequência; não pule os gates.

## Pré-condição

`.specs/sdd-<feature>/` já existe com `specs/NN-*.md` e `implementacao.md` (skill `sdd`).

## 1. Monte as ondas

Leia a coluna **Depende de** da tabela `## Ordem de Implementação` em `implementacao.md`. Onda 1
= specs com `—`. Onda N = specs cujas dependências já mergearam (marcadas 🟢 em `progresso.md`).
Specs da mesma onda sem dependência mútua rodam em paralelo.

## 2. Um subagente por spec da onda, disparados juntos

Antes de disparar, crie o isolamento (comandos, não subagente — não custa token):

~~~bash
git worktree add /tmp/spec-orch/<feature>-<NN> -b spec/<feature>/<NN>
~~~

Uma chamada de subagente por spec da onda, com nome `impl-<feature>-<NN>` para poder receber uma
correção no passo 4, todas disparadas em paralelo. No Codex, use `spawn_agent` com contexto
enxuto (`fork_turns: "none"`); no Claude Code, use `Agent`/`Task`. Não herde a conversa do
orquestrador.

Prompt autocontido por subagente (ele não vê esta conversa):

- Diretório: o worktree criado no passo acima. Trabalhe só dentro dele.
- Leia **só** a spec `specs/NN-*.md` inteira (ela é pequena de propósito). Seções que importam:
  `## Arquivos permitidos` (o que pode tocar — nada fora disso), `## Contratos` de specs das quais
  esta depende (leia só essa seção da spec dependida, nunca o código de produção dela — é o
  contrato, não a implementação), `## Casos de Teste Mínimos` (os testes a escrever e o comando de
  teste em `### Critério de aceite`).
- Se `PROJECT_MAP.md` existir na raiz do repo, leia só a Seção 0 + as seções que ela indicar pro
  escopo desta spec — nunca o arquivo inteiro. Se ela documentar comando de lint/typecheck,
  anote-o no relatório final — o orquestrador vai rodá-lo, não precisa rodar você mesmo.
- TDD: escreva o(s) teste(s) de `## Casos de Teste Mínimos` primeiro, rode o comando de teste,
  confirme que falha pelo motivo certo (se o teste importar um módulo que ainda não existe, a
  falha pode ser erro de coleta/import, não teste vermelho de verdade — cheque a mensagem). Só
  depois escreva o código de produção em `## Arquivos permitidos § Produção`, rode de novo até
  passar.
- Não toque nada fora de `## Arquivos permitidos`. Se a spec parecer incompleta ou ambígua
  (`⚠️ ABERTO:` pendente), pare e reporte — não invente.
- Se o comando de teste falhar por ambiente (binário ausente, `.env` faltando, import de pacote
  não instalado) em vez de por lógica, pare e reporte — o worktree novo pode não ter algo que não
  é versionado; não é algo que o subagente resolve de dentro.
- Ao final, edite a spec.md trocando 🟡 por ✅ nos RF/EC/T efetivamente cobertos pelo teste
  escrito — não marque um ID que o teste não exercita.
- `git add -A && git commit -m "..."` no worktree antes de reportar — dá ponto de rollback e deixa
  o diff pronto pras checagens do passo 3 sem precisar de mais nenhuma chamada de LLM.
- Reporte: `status` (`done` / `blocked`), lista dos arquivos alterados, o comando de teste final e
  o comando de lint/typecheck do repo (se houver, de `PROJECT_MAP.md`).

## 3. Checagens mecânicas antes do merge — Bash/grep, sem LLM

Para cada spec `done`, na própria thread principal:

~~~bash
cd /tmp/spec-orch/<feature>-<NN>

# 1. reconfirma o teste (o subagente já rodou, isso é só não confiar cegamente no relato)
<comando de teste reportado>

# 2. escopo: nada fora de "## Arquivos permitidos" da spec
git diff --name-only main... > /tmp/changed-<NN>.txt
# compare linha a linha contra os bullets de "## Arquivos permitidos" na spec.md — qualquer
# arquivo alterado que não esteja lá é scope creep

# 3. lint/typecheck do repo (só se PROJECT_MAP.md documentar um), escopado aos arquivos do diff
<comando de lint reportado> $(cat /tmp/changed-<NN>.txt)

# 4. sanity do contrato: se "## Contratos" da spec declara um nome de função/classe/endpoint,
# confirme que existe no arquivo de produção alterado
grep -n "<nome do símbolo do contrato>" <arquivo de produção>

# 5. cobertura de requisito: todo RF/EC/T marcado ✅ na spec precisa aparecer no arquivo de teste
grep -o 'RF-[0-9]\+\|EC-[0-9]\+\|T-[0-9]\+' <arquivo de teste>
~~~

Isso é comparação de texto, não julgamento — não precisa de LLM pra rodar. Falhou em qualquer
item → passo 4. Passou em tudo → passo 5 (merge).

## 4. Uma correção, de volta pro mesmo subagente

Se a reconfirmação (passo 3) falhar por qualquer motivo, ou o subagente já tinha reportado
`blocked`: envie o erro exato ao agente **pelo nome** (`impl-<feature>-<NN>`, não crie um agente
novo — no Codex, `followup_task`; no Claude, `SendMessage`). Isso preserva a sessão e evita pagar
o contexto frio de novo. Inclua a saída do teste, a
lista de arquivos fora do escopo, a linha do lint, o símbolo do contrato que faltou). Uma
tentativa só. Se ainda falhar depois disso: `blocked` de verdade — não mergeia, mantém o worktree
pra inspeção, reporta ao usuário, e pula (não dispara) qualquer spec de onda seguinte que dependa
dela.

## 5. Merge sequencial

Só depois do passo 3 (ou da correção do passo 4) passar limpo. Uma spec por vez — dois merges ao
mesmo tempo na branch de trabalho não é seguro:

~~~bash
git merge --no-edit spec/<feature>/<NN>
git worktree remove /tmp/spec-orch/<feature>-<NN> --force
git branch -D spec/<feature>/<NN>
~~~

## 6. Progresso

Depois de cada onda, atualize `.specs/sdd-<feature>/progresso.md` (🟢/❌ por spec, bloqueios
ativos) — arquivo já existe, gerado pela skill `sdd`.

## Quando não usar

Uma spec só: chame o subagente direto ou implemente você mesmo — orquestrador é overhead sem
paralelismo pra ganhar.
