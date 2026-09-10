# Registering a KTLO (Keep The Lights On) — PROJ

KTLO = unplanned operational work that "keeps the lights on": support requests, routine
maintenance, one-off data pulls, investigations. In PROJ a KTLO is **not a separate issue
type** — it's a **Tarefa** with three custom fields filled in (**KTLO**, **Área**, **Team**).
Reference card: **PROJ-XXXX** ("KTLO Alteração retroativa").

Trigger this flow when the user says things like "cadastre um KTLO", "registra esse suporte",
"abre um KTLO de rotina", or describes operational/support work to be logged.

## Field reference (PROJ — validated via `getJiraIssueTypeMetaWithFields`, issueTypeId `<id>`)

These option IDs are stable. Pass them by `id` in `additional_fields` — passing by `value`
(the label with emoji) is brittle, so prefer IDs.

### KTLO — `customfield_XXXXX` (select)

Pick the one matching the nature of the work:

| Value | id | When |
|-------|-----|------|
| <valor> | `<id>` |
| <valor> | `<id>` |
| <valor> | `<id>` |
| <valor> | `<id>` |

### Área — `customfield_XXXXX` (select)

Área de negócio que originou a demanda. Ask the user when unclear.

| Value | id | | Value | id |
|-------|-----|---|-------|-----|
| <valor> | `<id>` |
| <valor> | `<id>` |
| <valor> | `<id>` |
| <valor> | `<id>` |
| <valor> | `<id>` |
| <valor> | `<id>` |
| <valor> | `<id>` |

### Team — `customfield_XXXXX` (atlassian-team)

Default **Desenvolvimento** → id `<teamId>`. Pass the id as a raw
string (not wrapped in an object).

### Sprint — `customfield_XXXXX` (array of sprint)

**A KTLO is always registered in the active sprint** — never leave it in the backlog. The
sprint id changes every sprint, so you must look it up at create time (see "Finding the active
sprint" below) and pass it as an integer: `"customfield_XXXXX": <sprintId>`.

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
  cloudId="<cloudId>",
  jql="project = PROJ AND sprint IN openSprints()",
  fields=["customfield_XXXXX"],
  maxResults=1
)
```

In the result, `customfield_XXXXX` is an array of sprint objects. Pick the one with
`"state": "active"` and use its numeric `id`. (PROJ runs one active sprint on board <boardId>, e.g.
`{"id": <sprintId>, "name": "Sprint 12/26", "state": "active", "boardId": <boardId>}` → use `<sprintId>`.)

> Note: PROJ's board is configured to auto-add newly created issues to the active sprint, so a
> KTLO created without an explicit Sprint usually still lands in the current sprint. Don't rely
> on that — set `customfield_XXXXX` explicitly so the behavior is guaranteed, and always confirm
> in the verify step.

## Create call (working shape)

```
createJiraIssue(
  cloudId="<cloudId>",
  projectKey="PROJ",
  issueTypeName="Tarefa",
  summary="<título>",
  description="## Contexto\n...\n\n## Solicitante\n...",
  contentFormat="markdown",
  additional_fields={
    "issuetype": { "id": "10020" },                            // see gotcha below
    "customfield_XXXXX": { "id": "10208" },                    // KTLO
    "customfield_XXXXX": { "id": "10195" },                    // Área
    "customfield_XXXXX": "<teamId>", // Team
    "customfield_XXXXX": <sprintId>                                    // active sprint id (look it up!)
  }
)
```

### ⚠️ Gotcha: `issueTypeName="Tarefa"` alone fails

Creating with only `issueTypeName="Tarefa"` returns
`"O tipo de item selecionado é inválido."` even though `Tarefa` (id `<id>`) is the valid
PT-BR type. The name→id mapping in the MCP create tool doesn't resolve the Portuguese name.
**Fix:** also pass `"issuetype": { "id": "10020" }` inside `additional_fields`. Keep
`issueTypeName="Tarefa"` too (the param is required). This is the same root cause for any
PT-BR issue type — pass the id explicitly when a create fails on `issuetype`.

## Verify

After creating, read back just the custom fields and confirm they're set:

```
getJiraIssue(
  cloudId="<cloudId>",
  issueIdOrKey="PROJ-XXXX",
  fields=["customfield_XXXXX","customfield_XXXXX","customfield_XXXXX","customfield_XXXXX"]
)
```

The create response does **not** echo custom fields, so this read-back is the only confirmation
that KTLO / Área / Team / Sprint actually persisted. Pay special attention to Sprint — if it's
empty the KTLO landed in the backlog and must be moved into the active sprint.
