# Fase -1 — Ticket (opcional) + Grilling

Esta fase roda antes da Fase 0. Ela tem dois passos: (1) buscar o ticket no rastreador de issues,
se o usuário passou uma referência, e (2) entrevistar o usuário até a ideia estar afiada o
suficiente para virar spec.

**Roda sempre**, mesmo quando a invocação trouxe só uma descrição livre — a diferença é apenas a
semente da entrevista (o ticket vs. o texto de `$ARGUMENTS`).

O rastreador usado (se houver) está registrado em `.claude/sdd/perfil.md § Fluxo de trabalho`.
Se lá estiver "nenhum", pule direto para `-1.3`.

---

## -1.0 — Checar colisão com pasta SDD existente

Antes de qualquer coisa, derive um slug provisório da feature (do texto de `$ARGUMENTS` ou da
chave do ticket) e verifique se já existe pasta para ela:

```bash
find .specs -maxdepth 1 -iname "sdd-*<fragmento-do-slug>*" -type d
```

Se encontrar, **não sobrescreva silenciosamente**. Use `AskUserQuestion` para o usuário escolher:

- **Retomar/atualizar** a pasta existente (ex.: feature ainda com specs `🔴`/`🟡` em
  `progresso.md`) — nesse caso, leia `descricao_alto_nivel.md` e `progresso.md` antes do
  grilling, para não repetir perguntas já respondidas.
- **Criar pasta nova** com slug diferenciado, se for de fato outra feature que só coincide no
  nome.

Só prossiga depois dessa decisão.

## -1.1 — Detectar referência de ticket em `$ARGUMENTS`

- **Chave de issue:** padrão `[A-Z][A-Z0-9]+-\d+` (ex.: `ABC-1234`). Se vier só o número, use o
  prefixo de projeto registrado no perfil do repositório; se o perfil não declarar nenhum,
  pergunte em vez de adivinhar.
- **Link:** URL de issue do rastreador declarado no perfil (Jira, Linear, GitHub Issues…).

Sem nenhum dos dois, **não há ticket**: vá para `-1.3` usando `$ARGUMENTS` como a ideia solta.

## -1.2 — Buscar a história (se detectada)

Delegue à ferramenta que o ambiente já tiver, nesta ordem de preferência:

1. **Skill específica do rastreador**, se existir (ex.: uma skill de Jira que já sabe `cloudId` e
   projeto) — delegue em vez de duplicar a lógica dela.
2. **MCP do rastreador**, se conectado.
3. **CLI**, se disponível (`gh issue view <n>` para GitHub Issues).

```
Skill(skill: "<skill do rastreador>", args: "buscar os detalhes completos da issue <CHAVE>
(título, descrição, critérios de aceite, comentários relevantes) para usar como insumo de uma
sessão de grilling antes de escrever uma spec — não altere o ticket, só retorne os dados")
```

Se a busca falhar (issue inexistente, sem permissão, nenhuma ferramenta disponível), informe e
pergunte se o usuário quer corrigir a referência ou seguir sem o ticket, descrevendo em texto
livre.

**Nunca invente conteúdo do ticket.** Campo ausente (critério de aceite, por exemplo) é campo
ausente — não preencha com suposição.

## -1.3 — Grilling

Chame a skill de grilling disponível (ex.: `grilling`, do plugin `mattpocock-skills`) passando
como semente:

- título + descrição + critérios de aceite do ticket, se `-1.2` trouxe um; **e/ou**
- o texto original de `$ARGUMENTS` (sempre — o usuário costuma dar na invocação um contexto que
  não está no ticket).

```
Skill(skill: "grilling", args: "<resumo do ticket, se houver> + <$ARGUMENTS>")
```

A skill de grilling conduz a entrevista sozinha — não reimplemente o mecanismo, só dispare e
espere o resultado.

**Se não houver skill de grilling instalada**, conduza você mesmo uma entrevista curta antes de
seguir: pergunte, em rounds de no máximo 4 perguntas, até conseguir responder sem ambiguidade *o
que muda para quem*, *como se prova que funcionou* e *o que explicitamente fica de fora*. Não
pule esta etapa — é ela que evita spec construída sobre premissa errada.

**Critério de saída:** a entrevista termina quando não sobra pergunta aberta relevante e o
usuário confirma o entendimento compartilhado. Não corte por conta própria achando que "já deu".

## -1.4 — Levar o resultado para a Fase 0

A entrevista normalmente já resolve boa parte das perguntas obrigatórias da Fase 0 (objetivo,
regras de negócio, não-objetivos, tipo de mudança, integrações externas). **Não repita na Fase 0
o que já foi decidido aqui.**

Ao entrar na Fase 0:

1. Monte um resumo curto do que a entrevista decidiu, mapeando explicitamente para os itens de
   `fase0_alinhamento.md § 0.1`.
2. Pergunte **só o que ficou em aberto** — se a entrevista cobriu tudo, confirme o resumo em vez
   de repetir a bateria.
3. Se havia ticket, referencie a chave no `descricao_alto_nivel.md` gerado na Fase 4, para
   rastreabilidade.
