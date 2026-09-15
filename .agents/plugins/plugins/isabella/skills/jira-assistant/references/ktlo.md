# Registering a KTLO (Keep The Lights On) — DEVPO

KTLO = unplanned operational work that "keeps the lights on": support requests, routine
maintenance, one-off data pulls, investigations. In DEVPO a KTLO is **not a separate issue
type** — it's a **Tarefa** with three custom fields filled in (**KTLO**, **Área**, **Team**).
Reference card: **DEVPO-1023** ("KTLO Alteração retroativa").

Trigger this flow when the user says things like "cadastre um KTLO", "registra esse suporte",
"abre um KTLO de rotina", or describes operational/support work to be logged.

## Field reference (DEVPO — validated via `getJiraIssueTypeMetaWithFields`, issueTypeId `10020`)

These option IDs are stable. Pass them by `id` in `additional_fields` — passing by `value`
(the label with emoji) is brittle, so prefer IDs.

### KTLO — `customfield_10272` (select)

Pick the one matching the nature of the work:

| Value | id | When |
|-------|-----|------|
| Investigação 🔎 | `10205` | Apurar a causa de algo / descobrir se algo aconteceu. |
| Rotina ♻️ | `10206` | Tarefa recorrente de manutenção. |
| Envio de base pontual 📂 | `10207` | Extração/envio de base sob demanda. |
| Suporte 🫱🏼‍🫲🏼 | `10208` | Atender/responder pedido ou dúvida de outra área. |

### Área — `customfield_10271` (select)

Área de negócio que originou a demanda. Ask the user when unclear.

| Value | id | | Value | id |
|-------|-----|---|-------|-----|
| Atendimento PF | `10284` | | Growth | `10195` |
| Atendimento PJ | `10581` | | Jurídico \| Compliance | `10203` |
| Backoffice | `10286` | | Marketing | `10199` |
| BTO | `10200` | | Novos Negócios | `10204` |
| Corporate | `10196` | | One | `10317` |
| Financeiro | `10201` | | People | `10198` |
| | | | Wealth Management | `10197` |

### Team — `customfield_10001` (atlassian-team)

Default **Desenvolvimento** → id `3e9ef9d0-0690-4542-b45b-5fffbe1aa7f3`. Pass the id as a raw
string (not wrapped in an object).

### Sprint — `customfield_10020` (array of sprint)

**A KTLO is always registered in the active sprint** — never leave it in the backlog. The
sprint id changes every sprint, so you must look it up at create time (see "Finding the active
sprint" below) and pass it as an integer: `"customfield_10020": <sprintId>`.

## Process

1. **Gather the work.** Get a short description of what the support/maintenance was. The raw
   ask is usually informal — turn it into a clean **título** (summary) and **Contexto**.
2. **Pick the fields.** Ask the user for **KTLO type** and **Área** if not obvious from the
   request (offer the options above). Team defaults to Desenvolvimento.
3. **Find the active sprint** (see below) — KTLO always goes into it.
4. **Keep the description light.** A KTLO is a log of work, not a spec — a `## Contexto`
   section (and `## Solicitante` when someone requested it) is enough. Do **not** add
   Objetivo / Requisitos técnicos / Critérios de aceite unless the user asks; those belong on
   planned feature tickets, not KTLOs.
5. **Create**, then **verify** the custom fields landed (see below).

## Finding the active sprint

There's no dedicated board/sprint MCP tool, so read the active sprint id off any issue
currently in the open sprint:

```
searchJiraIssuesUsingJql(
  cloudId="cd98e150-0664-4411-8b41-195f8ff97f1e",
  jql="project = DEVPO AND sprint IN openSprints()",
  fields=["customfield_10020"],
  maxResults=1
)
```

In the result, `customfield_10020` is an array of sprint objects. Pick the one with
`"state": "active"` and use its numeric `id`. (DEVPO runs one active sprint on board 68, e.g.
`{"id": 2372, "name": "Sprint 12/26", "state": "active", "boardId": 68}` → use `2372`.)

> Note: DEVPO's board is configured to auto-add newly created issues to the active sprint, so a
> KTLO created without an explicit Sprint usually still lands in the current sprint. Don't rely
> on that — set `customfield_10020` explicitly so the behavior is guaranteed, and always confirm
> in the verify step.

## Create call (working shape)

```
createJiraIssue(
  cloudId="cd98e150-0664-4411-8b41-195f8ff97f1e",
  projectKey="DEVPO",
  issueTypeName="Tarefa",
  summary="<título>",
  description="## Contexto\n...\n\n## Solicitante\n...",
  contentFormat="markdown",
  additional_fields={
    "issuetype": { "id": "10020" },                            // see gotcha below
    "customfield_10272": { "id": "10208" },                    // KTLO
    "customfield_10271": { "id": "10195" },                    // Área
    "customfield_10001": "3e9ef9d0-0690-4542-b45b-5fffbe1aa7f3", // Team
    "customfield_10020": 2298                                    // active sprint id (look it up!)
  }
)
```

### ⚠️ Gotcha: `issueTypeName="Tarefa"` alone fails

Creating with only `issueTypeName="Tarefa"` returns
`"O tipo de item selecionado é inválido."` even though `Tarefa` (id `10020`) is the valid
PT-BR type. The name→id mapping in the MCP create tool doesn't resolve the Portuguese name.
**Fix:** also pass `"issuetype": { "id": "10020" }` inside `additional_fields`. Keep
`issueTypeName="Tarefa"` too (the param is required). This is the same root cause for any
PT-BR issue type — pass the id explicitly when a create fails on `issuetype`.

## Verify

After creating, read back just the custom fields and confirm they're set:

```
getJiraIssue(
  cloudId="cd98e150-0664-4411-8b41-195f8ff97f1e",
  issueIdOrKey="DEVPO-XXXX",
  fields=["customfield_10272","customfield_10271","customfield_10001","customfield_10020"]
)
```

The create response does **not** echo custom fields, so this read-back is the only confirmation
that KTLO / Área / Team / Sprint actually persisted. Pay special attention to Sprint — if it's
empty the KTLO landed in the backlog and must be moved into the active sprint.
