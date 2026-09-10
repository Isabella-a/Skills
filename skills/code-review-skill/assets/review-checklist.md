# Code Review Quick Checklist

Quick reference checklist for reviews in this monorepo (`apps/backend` NestJS, `apps/frontend` Next.js/React).

## Pre-Review (2 min)

- [ ] Read PR description and linked Jira issue
- [ ] Check PR size (<400 lines ideal)
- [ ] Verify CI status: lint, type-check (`tsc --noEmit`), tests passing
- [ ] Understand the business requirement (domain terms preserved in pt-BR)

## Architecture & Design (5 min)

- [ ] Solution fits the problem
- [ ] Consistent with existing patterns (Either/UnitOfWork/pg-boss on backend; Server/Client boundary, existing components on frontend)
- [ ] No simpler approach exists
- [ ] Change lives in the right location (module/context on backend, feature folder on frontend)

## Logic & Correctness (10 min)

- [ ] Edge cases handled
- [ ] Null/undefined checks present
- [ ] Off-by-one errors checked
- [ ] Race conditions considered (async writes, pg-boss)
- [ ] Error handling complete (`Either` branches, `toast.error`)
- [ ] Correct data types used, no `any`

## Security (5 min)

- [ ] No hardcoded secrets
- [ ] Input validated via DTO (backend) / Zod schema (frontend)
- [ ] SQL injection prevented (parameterized queries / ORM)
- [ ] XSS prevented (no unsanitized `dangerouslySetInnerHTML`)
- [ ] Authorization Guards present
- [ ] Sensitive data protected (not logged, not in client bundles)

## Performance (3 min)

- [ ] No N+1 queries
- [ ] Expensive operations optimized
- [ ] Large lists paginated (server-side `DataTable`)
- [ ] No obvious memory leaks (uncleaned effects/listeners/timers)
- [ ] Caching considered where appropriate

## Testing (5 min)

- [ ] Tests exist for new code (`*.spec.ts` / Playwright)
- [ ] Edge cases tested
- [ ] Error cases tested
- [ ] Tests are readable and deterministic

## Code Quality (3 min)

- [ ] Clear variable/function names
- [ ] No code duplication
- [ ] Functions do one thing
- [ ] Non-obvious logic has a comment explaining *why*
- [ ] No magic numbers/strings replacing an existing enum

## Documentation (2 min)

- [ ] Swagger decorators present for new/changed backend endpoints
- [ ] Breaking changes noted in the PR description
- [ ] Complex logic explained where genuinely non-obvious

---

## Severity Labels

| Label | Meaning | Action |
|---|---|---|
| 🔴 `[blocking]` | Must fix | Block merge |
| 🟡 `[important]` | Should fix | Discuss if disagree |
| 🟢 `[nit]` | Nice to have | Non-blocking |
| 💡 `[suggestion]` | Alternative | Consider |
| 📚 `[learning]` | Educational comment | No action needed |
| 🎉 `[praise]` | Good work | Celebrate! |

---

## Decision Matrix

| Situation | Decision |
|---|---|
| Critical security issue | 🔴 Block, fix immediately |
| Breaking change without migration/rollout plan | 🔴 Block |
| Multi-repo write without `UnitOfWork` | 🔴 Block |
| Missing error handling | 🟡 Should fix |
| No tests for new code | 🟡 Should fix |
| Style preference already covered by ESLint/Prettier | 🟢 Non-blocking |
| Minor naming improvement | 🟢 Non-blocking |
| Clever but working code | 💡 Suggest simpler |

---

## Time Budget

| PR Size | Target Time |
|---|---|
| < 100 lines | 10-15 min |
| 100-400 lines | 20-40 min |
| > 400 lines | Ask to split |

---

## Red Flags

Watch for these patterns:

- `// TODO` in production code
- `console.log` left in code (`/CLAUDE.md` bans this — use the project logger)
- Commented-out code
- `any` type in TypeScript
- `@ts-ignore` instead of `@ts-expect-error` with a justification
- Empty catch blocks
- Unhandled `Either.Err` branch
- Arbitrary Tailwind colors (`text-blue-500`) instead of design-system tokens
- Magic numbers/strings
- Copy-pasted code blocks
- Missing null checks
- Hardcoded URLs/credentials
- Relative imports (`../../../`) instead of the `@/...` alias
