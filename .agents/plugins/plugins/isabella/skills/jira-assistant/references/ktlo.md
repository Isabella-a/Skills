# Registering a KTLO (Keep The Lights On) — Jira

KTLO = unplanned operational work that "keeps the lights on": support requests, routine
maintenance, one-off data pulls, investigations. In this project a KTLO is **not a separate issue
type** — it's a **Tarefa** with three custom fields filled in (**KTLO**, **Área**, **Team**).

Trigger this flow when the user says things like "cadastre um KTLO", "registra esse suporte",
"abre um KTLO de rotina", or describes operational/support work to be logged.

## Field reference (project-specific — read from your config)

The IDs below are **not** shipped with this skill. Resolve them in this order:

1. A `## KTLO` section in your workspace `jira-config.md` / `CLAUDE.md` / `AGENTS.md`
   (keep it **out of public repos**). Expected keys:

   ```
   ## KTLO
   - issueTypeId: <id of the Tarefa/Task type>
   - KTLO field:  customfield_XXXXX   # options: Investigação, Rotina, Envio de base pontual, Suporte -> option ids
   - Área field:  customfield_XXXXX   # options: your business areas -> option ids
   - Team field:  customfield_XXXXX   # default team id (atlassian-team, pass raw string)
   - Sprint field: customfield_XXXXX  # usually the "Sprint" field
   ```

2. If missing, discover them: `getJiraIssueTypeMetaWithFields(cloudId, projectKey, issueTypeId)`
   and match the fields named **KTLO**, **Área**, **Team**, **Sprint**; ask the user which
   option ids to use and offer to write them to the config section above.

Pass options by `id` in `additional_fields` — passing by `value` (label with emoji) is brittle.
Below, `KTLO_FIELD`, `AREA_FIELD`, `TEAM_FIELD`, `SPRINT_FIELD` stand for the resolved field keys.

Pick the KTLO type matching the nature of the work: **Investigação** (find a cause), **Rotina**
(recurring maintenance), **Envio de base pontual** (on-demand data extract), **Suporte** (answer a
request from another area). **Área** = business area that originated the demand — ask the user
when unclear. **Team** — pass the id as a raw string (not wrapped in an object).

### Sprint — `SPRINT_FIELD` (array of sprint)

**A KTLO is always registered in the active sprint** — never leave it in the backlog. The
sprint id changes every sprint, so look it up at create time (see "Finding the active
sprint" below) and pass it as an integer: `"<SPRINT_FIELD>": <sprintId>`.

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
  jql="project = <projectKey> AND sprint IN openSprints()",
  fields=["<SPRINT_FIELD>"],
  maxResults=1
)
```

In the result, the sprint field is an array of sprint objects. Pick the one with
`"state": "active"` and use its numeric `id`. (Example: `{"id": 123, "name": "Sprint 1", "state": "active", "boardId": 1}` → use `123`.)

> Note: the project board is configured to auto-add newly created issues to the active sprint, so a
> KTLO created without an explicit Sprint usually still lands in the current sprint. Don't rely
> on that — set `<SPRINT_FIELD>` explicitly so the behavior is guaranteed, and always confirm
> in the verify step.

## Create call (working shape)

```
createJiraIssue(
  cloudId="<cloudId>",
  projectKey="<projectKey>",
  issueTypeName="Tarefa",
  summary="<título>",
  description="## Contexto\n...\n\n## Solicitante\n...",
  contentFormat="markdown",
  additional_fields={
    "issuetype": { "id": "<issueTypeId>" },                            // see gotcha below
    "<KTLO_FIELD>": { "id": "<optionId>" },                    // KTLO
    "<AREA_FIELD>": { "id": "<optionId>" },                    // Área
    "<TEAM_FIELD>": "<teamId>",                                  // Team
    "<SPRINT_FIELD>": <sprintId>                                 // active sprint id (look it up!)
  }
)
```

### ⚠️ Gotcha: `issueTypeName="Tarefa"` alone fails

Creating with only `issueTypeName="Tarefa"` returns
`"O tipo de item selecionado é inválido."` even though `Tarefa` (its id is `<issueTypeId>`) is the valid
PT-BR type. The name→id mapping in the MCP create tool doesn't resolve the Portuguese name.
**Fix:** also pass `"issuetype": { "id": "<issueTypeId>" }` inside `additional_fields`. Keep
`issueTypeName="Tarefa"` too (the param is required). This is the same root cause for any
PT-BR issue type — pass the id explicitly when a create fails on `issuetype`.

## Verify

After creating, read back just the custom fields and confirm they're set:

```
getJiraIssue(
  cloudId="<cloudId>",
  issueIdOrKey="PROJ-XXXX",
  fields=["<KTLO_FIELD>","<AREA_FIELD>","<TEAM_FIELD>","<SPRINT_FIELD>"]
)
```

The create response does **not** echo custom fields, so this read-back is the only confirmation
that KTLO / Área / Team / Sprint actually persisted. Pay special attention to Sprint — if it's
empty the KTLO landed in the backlog and must be moved into the active sprint.
