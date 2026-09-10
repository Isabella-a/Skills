---
name: code-review-skill
description: |
  Provides code review guidance scoped to the One Portal monorepo stack: NestJS 11 (backend, Either pattern, Unit of Work, pg-boss, TypeORM/Kysely), React 19 + Next.js 16 (frontend, App Router, RSC, TanStack Query v5, React Hook Form + Zod), and TypeScript/SQL in general.
  Helps catch bugs, improve code quality, and give constructive feedback consistent with this repo's conventions.
  Use when: reviewing pull requests, conducting PR reviews, code review, reviewing code changes,
  establishing review standards, mentoring developers, architecture reviews, security audits,
  checking code quality, finding bugs, giving feedback on code.
allowed-tools:
  - Read
  - Grep
  - Glob
  - Bash      # run lint/test/build commands to validate code quality
  - WebFetch  # check up-to-date docs and best practices when needed
---

# Code Review Skill

Transform code reviews from gatekeeping to knowledge sharing through constructive feedback, systematic analysis, and collaborative improvement — adapted to how this monorepo actually works.

## Scope

This skill is scoped to the two apps in this monorepo:

- **`apps/backend`** — NestJS 11, TypeScript, TypeORM (PostgreSQL) + Kysely (SQLite reads), Zod (env validation), Vitest, pg-boss.
- **`apps/frontend`** — Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, TanStack Query v5, React Hook Form + Zod, Playwright/Vitest.

Before reviewing, re-read [`/CLAUDE.md`](../../../CLAUDE.md) and the app-specific `apps/backend/CLAUDE.md` / `apps/frontend/CLAUDE.md` — those are the source of truth for this repo's conventions and take precedence over anything generic in this skill.

## When to Use This Skill

- Reviewing pull requests and code changes in `apps/backend` or `apps/frontend`
- Establishing code review standards for the team
- Mentoring developers through reviews
- Conducting architecture reviews (module boundaries, Either pattern, Unit of Work usage)
- Creating review checklists
- Reducing code review cycle time
- Maintaining code quality standards

## Core Principles

### 1. The Review Mindset

**Goals of Code Review:**
- Catch bugs and edge cases
- Ensure code maintainability
- Share knowledge across the team
- Enforce this repo's coding standards (see app-level `CLAUDE.md` files)
- Improve design and architecture
- Build team culture

**Not the Goals:**
- Show off knowledge
- Nitpick formatting — ESLint/Prettier via `lint-staged` already enforce this
- Block progress unnecessarily
- Rewrite to your preference when the existing pattern already works

### 2. Effective Feedback

**Good Feedback is:**
- Specific and actionable
- Educational, not judgmental
- Focused on the code, not the person
- Balanced (praise good work too)
- Prioritized (critical vs nice-to-have)

Comments left on PRs for humans should be written in **português brasileiro**, per this repo's language convention (`/CLAUDE.md`); code, identifiers, and this skill's own reference material stay in English.

```markdown
❌ Ruim: "Isso está errado."
✅ Bom: "Isso pode causar uma condição de corrida quando múltiplos
        usuários acessam simultaneamente. Já pensou em usar UnitOfWork aqui?"

❌ Ruim: "Por que você não usou o padrão Either?"
✅ Bom: "Esse service está lançando exceção direto — já vimos esse caso
        no padrão Either (`helpers/either.ts`)? Ficaria mais consistente
        com o resto do módulo."

❌ Ruim: "Renomeia essa variável."
✅ Bom: "[nit] `uc` → `userCount` deixaria mais claro. Não bloqueia."
```

### 3. Review Scope

**What to Review:**
- Logic correctness and edge cases
- Security vulnerabilities
- Performance implications (N+1 queries, unnecessary re-renders)
- Test coverage and quality (`*.spec.ts`, `*.e2e-spec.ts`, Playwright specs)
- Error handling — `Either<L, R>` on the backend, `toast.error` + Sonner on the frontend
- API design and naming, module/context boundaries
- Fit with existing architecture (Either, Unit of Work, pg-boss, App Router conventions)

**What Not to Review Manually:**
- Code formatting — Prettier/ESLint (`lint-staged`) already enforce this
- Import organization (`@/*` alias vs relative imports is a real review point, formatting order is not)
- Simple typos

## Review Process

### Phase 1: Context Gathering (2-3 minutes)

1. Read PR description and linked Jira issue
2. Check PR size (>400 lines? suggest splitting)
3. Review CI status (lint, type-check, tests passing?)
4. Understand the business requirement (domain terms: cliente, receita, nota fiscal, fornecedor, wallet…)
5. Note whether the change touches `apps/backend`, `apps/frontend`, or both — CI is scoped by `paths:`, so cross-cutting changes need extra care

> For large diffs, pipe the diff through [`scripts/pr-analyzer.ts`](scripts/pr-analyzer.ts) (`git diff main...HEAD | npx tsx scripts/pr-analyzer.ts --stats`) to triage complexity and flag risk factors (missing tests, migrations touched, security-sensitive files) before reading line by line.

### Phase 2: High-Level Review (5-10 minutes)

1. **Architecture & Design** — Does the solution fit the existing patterns?
   - Backend: does it respect module/context structure, `Either` return types, `UnitOfWork` for multi-repository operations, pg-boss for secondary effects (see [NestJS Guide](reference/nestjs-typescript.md))?
   - Frontend: Server Component by default, `"use client"` only when needed, existing form/table components reused (see [React/Next.js Guide](reference/react-nextjs.md))?
   - For deeper architectural questions, consult [Architecture Review Guide](reference/architecture-review-guide.md)
2. **Performance Assessment** — N+1 queries (TypeORM/Kysely), unnecessary client-side fetching, missing pagination on list endpoints/tables. See [Performance Review Guide](reference/performance-review-guide.md).
3. **File Organization** — New backend contexts under `src/modules/<module>/contexts/<use-case>/`; new frontend files following the closest existing screen/feature. Migrations only in `infra/database/migrations/` (Postgres/TypeORM) or `infra/database/sqlite-migrations/` (Kysely).
4. **Testing Strategy** — Unit specs co-located in `tests/` folders (backend), Playwright specs for critical frontend flows.

### Phase 3: Line-by-Line Review (10-20 minutes)

For each file, check:
- **Logic & Correctness** — edge cases, off-by-one, null/undefined checks, race conditions
- **Security** — input validation (`class-validator`/Zod DTOs on the backend, Zod schemas on the frontend), authorization guards, no secrets in code
- **Performance** — N+1 queries, unnecessary loops, missing `React.memo`/`useMemo` where it actually matters, unbounded lists without pagination/virtualization
- **Maintainability** — clear names, single responsibility, comments only where the *why* isn't obvious
- **Reuse** — before accepting new code, search for existing utilities/hooks/components that could replace it (`InputField`, `ComboboxField`, `DataTable`, `PathBuilder`-style helpers, etc.). See [Universal Quality Guide](reference/code-quality-universal.md) for anti-patterns like parameter sprawl, leaky abstractions, nested conditionals, stringly-typed code, TOCTOU, and no-op updates.

> **Optional: over-engineering pass.** If the `ponytail:ponytail-review` skill is available (third-party plugin, not every setup has it installed), run it as an extra pass over the diff after the checks above. It's best-effort — if the skill isn't available, skip this and continue with just the Reuse check. Fold any findings it surfaces into the same PR comment (see [PR Review Template](assets/pr-review-template.md#simplification-ponytail-review-optional)) instead of posting a separate comment, and de-duplicate against anything the Reuse check already flagged. Ponytail findings have no severity of their own — map them to this skill's tiers: 🟢 `[nit]` by default, 🟡 `[important]` only if the over-engineering is a real maintainability risk (e.g. an unneeded dependency).

### Phase 4: Summary & Decision (2-3 minutes)

1. Summarize key concerns
2. Highlight what you liked
3. Make a clear decision:
   - ✅ Approve
   - 💬 Comment (minor suggestions)
   - 🔄 Request Changes (must address)
4. Offer to pair if complex

## Review Techniques

### Technique 1: The Checklist Method

Use [`assets/review-checklist.md`](assets/review-checklist.md) for a consistent quick pass, and [Security Review Guide](reference/security-review-guide.md) for a deeper security pass.

### Technique 2: The Question Approach

Instead of stating problems, ask questions:

```markdown
❌ "Isso vai quebrar se a lista vier vazia."
✅ "O que acontece se `items` vier como array vazio?"

❌ "Precisa de tratamento de erro aqui."
✅ "Como isso deveria se comportar se a chamada à API falhar?"
```

### Technique 3: Suggest, Don't Command

```markdown
❌ "Troca isso para usar Either."
✅ "Sugestão: encapsular esse retorno em `Either<ErrorType, SuccessType>`
   deixaria consistente com o resto do módulo. O que acha?"

❌ "Extrai isso pra um hook."
✅ "Essa lógica de fetch aparece em 3 componentes. Faria sentido
   extrair para um `use<Recurso>` em `src/hooks/`?"
```

### Technique 4: Differentiate Severity

- 🔴 `[blocking]` — Must fix before merge
- 🟡 `[important]` — Should fix, discuss if disagree
- 🟢 `[nit]` — Nice to have, not blocking
- 💡 `[suggestion]` — Alternative approach to consider
- 📚 `[learning]` — Educational comment, no action needed
- 🎉 `[praise]` — Good work, keep it up!

**Severity levels:** 🔴 / 🟡 / 🟢 are the three severity tiers used as the standard across all guides in this skill — 🔴 blocks the merge, 🟡 should be addressed, 🟢 is optional. The remaining markers (💡 / 📚 / 🎉) are non-blocking annotations.

## Stack-Specific Guides

| App / Layer | Reference File | Key Topics |
|-------------|----------------|------------|
| **Backend (NestJS)** | [NestJS / Backend Guide](reference/nestjs-typescript.md) | Either pattern, Unit of Work, pg-boss consumers, module/context structure, DTO validation, TypeORM/Kysely N+1, migrations |
| **Frontend (React / Next.js)** | [React / Next.js Guide](reference/react-nextjs.md) | React 19 hooks/Actions, Next.js 16 App Router & RSC, TanStack Query v5, React Hook Form + Zod, DataTable, nuqs, design system tokens |
| **TypeScript (general)** | [Common Bugs Checklist](reference/common-bugs-checklist.md#typescript--javascript) | Type safety, async/await, `any` avoidance, promise handling |
| **SQL / Migrations** | [Common Bugs Checklist](reference/common-bugs-checklist.md#sql--migrations) | N+1, indexing, migration conventions for `infra/database/migrations` |

## Cross-Cutting Guides

Stack-agnostic patterns applicable to any file in this repo:

| Topic | Reference File | Key Topics |
|-------|----------------|------------|
| **Universal Quality** | [Universal Quality Guide](reference/code-quality-universal.md) | Reuse audit, parameter sprawl, leaky abstractions, nested conditionals, stringly-typed code, TOCTOU, no-op updates, redundant state |
| **Architecture** | [Architecture Review Guide](reference/architecture-review-guide.md) | SOLID, coupling/cohesion, layering, anti-patterns |
| **Performance** | [Performance Review Guide](reference/performance-review-guide.md) | Core Web Vitals, N+1 queries, algorithmic complexity, memory leaks |
| **Security** | [Security Review Guide](reference/security-review-guide.md) | OWASP Top 10, auth/authz, input validation, secrets handling |

## Additional Resources

- [Architecture Review Guide](reference/architecture-review-guide.md)
- [Performance Review Guide](reference/performance-review-guide.md)
- [Common Bugs Checklist](reference/common-bugs-checklist.md)
- [Security Review Guide](reference/security-review-guide.md)
- [Code Review Best Practices](reference/code-review-best-practices.md)
- [NestJS / Backend Guide](reference/nestjs-typescript.md)
- [React / Next.js Guide](reference/react-nextjs.md)
- [PR Review Template](assets/pr-review-template.md)
- [Review Checklist](assets/review-checklist.md)
