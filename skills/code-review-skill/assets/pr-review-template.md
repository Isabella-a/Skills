# PR Review Template

Copy and use this template for code reviews. Comments left for humans should be in whatever
language this repo's PRs actually use (check `CLAUDE.md`/`CONTRIBUTING.md`, or past PR comments);
this template's structure/labels stay in English to match the rest of this skill.

---

## Summary

[Brief overview of what was reviewed - 1-2 sentences]

**Workspace(s):** [per PROJECT_MAP.md §2, if a monorepo — else omit]
**PR Size:** [Small/Medium/Large] (~X lines)
**Review Time:** [X minutes]

## Strengths

- [What was done well]
- [Good patterns or approaches used]
- [Improvements from previous code]

## Required Changes

🔴 **[blocking]** [Issue description]
> [Code location or example]
> [Suggested fix or explanation]

🔴 **[blocking]** [Issue description]
> [Details]

## Important Suggestions

🟡 **[important]** [Issue description]
> [Why this matters]
> [Suggested approach]

## Minor Suggestions

🟢 **[nit]** [Minor improvement suggestion]

💡 **[suggestion]** [Alternative approach to consider]

## Simplification (ponytail-review, optional)

> Only include this section if the `ponytail:ponytail-review` skill ran. Fold each finding in here using this skill's severity tiers — don't post it as a separate comment. Remove the section entirely if the skill didn't run or found nothing new beyond the Reuse check.

🟢 **[nit]** [What to cut] → [what replaces it, e.g. stdlib/native feature]
> **Local:** `arquivo.ts:123`

## Learning Notes

📚 [Educational context worth sharing about X]

📚 [Background behind design decision Y]

## Security Considerations

- [ ] No hardcoded secrets
- [ ] Input validated at the boundary on new endpoints/handlers
- [ ] Authorization checks in place
- [ ] No SQL/XSS injection risks

## Architecture Considerations

*(fill in from `PROJECT_MAP.md` §4/§11 — examples below, keep only what applies)*

- [ ] Documented error-handling pattern respected, all branches handled
- [ ] Multi-step writes wrapped in this repo's transaction/unit-of-work pattern, if it has one
- [ ] Secondary effects published via this repo's async/job convention, not inline
- [ ] Server/Client component boundary respected, if this is a React Server Components app
- [ ] Existing form/table/design-system components reused, not reinvented

## Test Coverage

- [ ] Unit tests added/updated, per `PROJECT_MAP.md` §6 convention
- [ ] E2E tests added for critical flows, if this repo has that layer
- [ ] Edge cases covered
- [ ] Error cases tested (including the "failure" branch of this repo's error-handling pattern)

## Verdict

**[ ] ✅ Approve** - Ready to merge
**[ ] 💬 Comment** - Minor suggestions, can merge
**[ ] 🔄 Request Changes** - Must address blocking issues

---

## Quick Copy Templates

### Blocking Issue
```
🔴 **[blocking]** [Título]

[Descrição do problema]

**Local:** `arquivo.ts:123`

**Sugestão de correção:**
\`\`\`typescript
// código sugerido
\`\`\`
```

### Important Suggestion
```
🟡 **[important]** [Título]

[Por que isso importa]

**Considerar:**
- Opção A: [descrição]
- Opção B: [descrição]
```

### Minor Suggestion
```
🟢 **[nit]** [Sugestão]

Não bloqueia, mas considere [melhoria].
```

### Praise
```
🎉 **[praise]** Mandou bem em [coisa específica]!

[Por que isso é bom]
```

### Learning
```
📚 **[learning]** [Nota educativa]

Só para contexto: [X] funciona assim porque [Y]. Não precisa de ação — é só compartilhar.
```
