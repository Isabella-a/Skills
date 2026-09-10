# Common Bugs Checklist

Quick-reference bug patterns for this monorepo's stack. For detailed examples and full checklists, see the dedicated guides linked below.

## Universal Issues

### Logic Errors
- [ ] Off-by-one errors in loops and array access
- [ ] Incorrect boolean logic
- [ ] Missing null/undefined checks
- [ ] Race conditions in concurrent code (async writes, pg-boss consumers)
- [ ] Incorrect comparison operators (`==` vs `===`)
- [ ] Floating point comparison issues (money math — prefer integer cents or a decimal library)

### Resource Management
- [ ] DB connections/transactions not released (missing `UnitOfWork` cleanup)
- [ ] Event listeners not removed (frontend)
- [ ] Timers/intervals not cleared (frontend)
- [ ] pg-boss consumers not acknowledging/completing jobs correctly

### Error Handling
- [ ] Swallowed exceptions (empty catch blocks)
- [ ] Generic exception handling hiding specific errors
- [ ] `Either` error branch (`isErr()`) not handled — see [NestJS Guide](nestjs-typescript.md#either-pattern)
- [ ] Missing error propagation

## TypeScript / JavaScript

- [ ] `==` instead of `===`
- [ ] Using `any` — prefer proper types or `unknown` with a type guard (`/CLAUDE.md` explicitly bans `any`)
- [ ] `@ts-ignore` instead of `@ts-expect-error` with a justification comment
- [ ] Missing `await` on async calls
- [ ] Unhandled promise rejections (no try/catch around an awaited call, or a dangling `.then()` with no `.catch()`)
- [ ] `this` context lost in callbacks
- [ ] Missing `key` prop in lists
- [ ] Closure capturing a stale loop variable
- [ ] Modifying an array/object while iterating it
- [ ] Sequential `await` for independent async calls instead of `Promise.all`

## React 19 / Next.js 16

- [ ] Hooks called conditionally or inside loops (violates Rules of Hooks)
- [ ] `useEffect` dependency array incomplete or incorrect
- [ ] `useEffect` missing a cleanup function (subscriptions, timers, fetches)
- [ ] `useEffect` used for derived state instead of computing during render/`useMemo`
- [ ] Component defined inside another component (re-mounts every render)
- [ ] Unstable props (inline objects/functions passed to memoized components)
- [ ] List missing a stable `key`, or using array index as key on a reorderable list
- [ ] Server Component using client-only APIs (`useState`, `useEffect`, `onClick`)
- [ ] `"use client"` placed on a parent, dragging the entire subtree client-side
- [ ] `useOptimistic` used as the only safety net for critical operations (payments, deletions)

**TanStack Query v5:**
- [ ] `queryKey` missing parameters that affect the returned data
- [ ] `useSuspenseQuery` combined with `enabled` (unsupported in v5)
- [ ] Mutation not invalidating related queries on success
- [ ] v4 array syntax (`useQuery(['key'], fn)`) instead of v5 object syntax

**Testing (Playwright/Vitest):**
- [ ] Using `container.querySelector` instead of `screen.getByRole`
- [ ] Using `fireEvent` instead of `userEvent`
- [ ] Testing implementation details instead of user-visible behavior
- [ ] Using `getBy*` for async content instead of `findBy*`

**Full guide:** [React / Next.js Guide](react-nextjs.md)

## NestJS / Backend

- [ ] `Either` error branch not handled in a controller
- [ ] Multi-repository write not wrapped in `UnitOfWork.exec()`
- [ ] Secondary effect (email, HubSpot, notification) running inline instead of published via pg-boss
- [ ] Controller input without a validated DTO (`@Body() body: any`)
- [ ] Manual instantiation (`new SomeRepositoryImpl()`) bypassing constructor injection
- [ ] Circular module dependency without `forwardRef()`
- [ ] New migration hand-written instead of generated, or not added to `test/setup-e2e.ts`

**Full guide:** [NestJS / Backend Guide](nestjs-typescript.md)

## SQL / Migrations

- [ ] String concatenation building a query (SQL injection risk) — use parameterized queries or the ORM
- [ ] Missing index on filtered/joined columns
- [ ] `SELECT *` instead of specific columns
- [ ] N+1 query pattern (TypeORM lazy relations, Kysely calls inside a loop)
- [ ] Missing `LIMIT`/pagination on a large table
- [ ] `NULL` comparisons handled incorrectly (`IS NULL` vs `= NULL`)
- [ ] Missing transaction for related operations
- [ ] Migration touches `infra/database/migrations/` but wasn't generated per this repo's sequence (see [NestJS Guide](nestjs-typescript.md#migrations)), or isn't registered in `test/setup-e2e.ts`

**See also:** [Security Review Guide](security-review-guide.md) for SQL injection prevention.

## API Design

- [ ] Inconsistent resource naming
- [ ] Wrong HTTP methods (POST for an idempotent operation)
- [ ] Missing pagination for list endpoints
- [ ] Incorrect status codes
- [ ] Missing rate limiting on public/auth endpoints
- [ ] Missing input validation (DTO) and sanitization
- [ ] Trusting client-side validation only — server must re-validate

## Testing

- [ ] Testing implementation details instead of behavior
- [ ] Missing edge case tests
- [ ] Flaky tests (non-deterministic, order-dependent)
- [ ] E2E tests relying on leftover state from a previous test
- [ ] Missing negative tests (error/`Either.Err` cases)
- [ ] Overly complex test setup
