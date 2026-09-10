# React / Next.js Review Guide (`apps/frontend`)

Review guide scoped to this repo's frontend: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, TanStack Query v5, React Hook Form + Zod, `nuqs` v2, Playwright/Vitest. For the full conventions reference, see `apps/frontend/CLAUDE.md` and `SYSTEM_DESIGN.md`.

## Table of Contents

- [Server vs Client Components](#server-vs-client-components)
- [React 19 Hooks & Rules of Hooks](#react-19-hooks--rules-of-hooks)
- [TanStack Query v5](#tanstack-query-v5)
- [Forms: React Hook Form + Zod](#forms-react-hook-form--zod)
- [DataTable & URL State (nuqs)](#datatable--url-state-nuqs)
- [Design System Tokens](#design-system-tokens)
- [Component Reuse](#component-reuse)
- [Testing](#testing)
- [Review Checklist](#review-checklist)

---

## Server vs Client Components

Default is Server Component under the App Router. Add `"use client"` only when the component genuinely needs React hooks, browser events, local state, or a client-only library (MSAL, Radix bits that need a portal, etc.).

```tsx
// ❌ "use client" on a component that only renders static/server data
"use client";
export function OrderSummary({ order }: { order: Order }) {
  return <div>{order.total}</div>;
}

// ✅ Server Component — no client APIs used
export function OrderSummary({ order }: { order: Order }) {
  return <div>{order.total}</div>;
}
```

**Review points:**
- Is `"use client"` on the actual leaf that needs it, or on a parent that drags the whole subtree client-side?
- Server Component using client-only APIs (`useState`, `useEffect`, `onClick`)? That's a bug, not a style nit.
- Simple mutations use Server Actions where it fits (form → action → revalidate) instead of a client-side fetch + manual invalidation.

---

## React 19 Hooks & Rules of Hooks

```tsx
// ❌ useEffect syncing derived state
useEffect(() => {
  setFullName(`${firstName} ${lastName}`);
}, [firstName, lastName]);

// ✅ Compute during render (or useMemo if expensive)
const fullName = `${firstName} ${lastName}`;
```

**Review points:**
- Hooks called conditionally or inside loops (violates Rules of Hooks)?
- `useEffect` used to sync derived state instead of computing it during render — this repo explicitly avoids that pattern (`apps/frontend/CLAUDE.md`).
- `useEffect` dependency array complete? Missing cleanup for subscriptions/timers/listeners?
- `useActionState`/`useOptimistic` used correctly — `useOptimistic` should not be the only safety net for critical operations (payments, deletions).
- List rendering: stable `key`, not array index, when the list can reorder or items can be inserted/removed.

---

## TanStack Query v5

This repo uses v5 syntax exclusively — flag any v4 leftovers.

```tsx
// ❌ v4 array syntax
useQuery(['user', id], () => fetchUser(id));

// ❌ v4 boolean flag
useQuery({ queryKey: ['user', id], queryFn, keepPreviousData: true });

// ✅ v5 object syntax + placeholderData
import { keepPreviousData } from '@tanstack/react-query';
useQuery({
  queryKey: ['user', id],
  queryFn: () => fetchUser(id),
  placeholderData: keepPreviousData,
});
```

**Review points:**
- `queryKey` includes every parameter that affects the returned data (filters, pagination, sort) — a stale key means stale cache hits across different params.
- Mutations invalidate the related `queryKey`s on success (`queryClient.invalidateQueries`).
- Query hooks live in `src/hooks/`, named `use<Recurso>` (e.g. `useManagedClientAccounts`), not inlined ad hoc in the component.
- `useSuspenseQuery` never combined with `enabled` (unsupported in v5).

---

## Forms: React Hook Form + Zod

Forms in this repo always go through React Hook Form + Zod (`@hookform/resolvers/zod`). Reusable field components already exist (`InputField`, `ComboboxField`, `DatePickerField`, `SwitchField`, `TextareaField`, etc.) — new forms should use them, not hand-roll `<input>` + manual `register()` wiring.

```tsx
// ❌ Reinventing a field wrapper that already exists as InputField
<input {...register('email')} />
{errors.email && <span>{errors.email.message}</span>}

// ✅ Existing field component
<InputField control={control} name="email" label="E-mail" />
```

**Review points:**
- Is a new hand-rolled field wrapper actually just `InputField`/`ComboboxField`/etc. duplicated?
- Zod schema lives in its own `*.schema.ts` file colocated with the form, not inlined in the component.
- `<Controller>` sits at the call site in the parent form component (this repo's "Controller-at-call-site" convention), not buried inside a generic wrapper.
- Conditional validation (PF vs PJ, create vs edit) uses `.superRefine()` or a discriminated union, not ad hoc `if` checks scattered after validation.

---

## DataTable & URL State (nuqs)

There's an existing `DataTable` built on TanStack Table v8 — reuse it instead of building a new table. Pagination is **server-side** by default; the table does not paginate locally.

```tsx
// ❌ Loading everything client-side and paginating in JS
const { data } = useQuery({ queryKey: ['orders'], queryFn: fetchAllOrders });
const page = data.slice(offset, offset + limit);

// ✅ Server-side pagination via query params
const { data } = useQuery({
  queryKey: ['orders', { page, limit }],
  queryFn: () => fetchOrders({ page, limit }),
});
```

**Review points:**
- Is a new table reinventing pagination/sorting/filtering that `DataTable` already provides?
- Filters, pagination, and selection sync to the URL via `nuqs` (`useQueryState`/`useQueryStates`) unless `disableUrlState` is intentionally set?
- Column filter type declared via `meta` (`text`, `select`, `datepicker`, `monthpicker`) instead of custom filter UI?

---

## Design System Tokens

```tsx
// ❌ Arbitrary Tailwind color
<span className="text-blue-500 border-red-600">

// ✅ Semantic design-system token
<span className="text-authority border-reserved">
```

**Review points:**
- Any raw Tailwind color utility (`text-blue-500`, `bg-red-600`, etc.) instead of the semantic palette (`authority`, `strategy`, `consistent`, `reserved`, `accurate`) or `bg-surface-*`/`text-foreground-*`/`border-border-*` tokens?
- New typography using the token classes (`.display-*`, `.h1`–`.h5`, `.eyebrow`, `.metric`) or CSS vars (`--font-primary`, `--font-secondary`, `--font-mono`) instead of inline font overrides?
- If a needed color/token doesn't exist yet — was one improvised, or was it flagged to ask before creating it?

---

## Component Reuse

```tsx
// ❌ New date formatting util when date-fns is already the convention
function formatDate(d: Date) { return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; }

// ✅ Use the established library
import { format } from 'date-fns';
format(d, 'dd/MM/yyyy');
```

**Review points:**
- Dates: `date-fns` for new code, `dayjs` only where already in use — not mixed within the same file.
- Brazilian-specific formatting (CPF/CNPJ/CEP/moeda/telefone) uses `brazilian-values` / `libphonenumber-js`, not hand-rolled regex.
- Input masks use `@react-input/mask` or `react-number-format`, not manual keypress handling.
- HTTP calls go through the centralized axios client in `src/lib/`, not a fresh `axios.create()`.
- New component/page/hook could have used `npm run generate` (Plop) — if a template exists and wasn't used, ask why.
- Relative imports (`../../../`) instead of the `@/...` alias.

---

## Testing

- **Playwright** E2E specs in `tests/`/`e2e/` — use `data-testid` for selectors, not text that can change.
- **Vitest** for unit/component tests (via `@storybook/addon-vitest`).
- New critical-flow features should ship with at least one happy-path E2E test.

**Review points:**
- `screen.getByRole` over `container.querySelector`; `userEvent` over `fireEvent`.
- Async content awaited with `findBy*`, not asserted immediately with `getBy*`.
- Tests assert user-visible behavior, not implementation details.
- Parametrized tests where variation exists (PF vs PJ, multiple status values) instead of copy-pasted near-duplicate tests.

---

## Review Checklist

- [ ] **Server/Client boundary**: `"use client"` only on the leaf that needs it; no client APIs in a Server Component?
- [ ] **Hooks**: no `useEffect` for derived state; dependency arrays complete; cleanup present?
- [ ] **TanStack Query v5**: object syntax, `placeholderData: keepPreviousData`, `queryKey` includes all relevant params, mutations invalidate on success?
- [ ] **Forms**: React Hook Form + Zod, existing field components reused, schema in its own file, Controller at call site?
- [ ] **DataTable/nuqs**: existing `DataTable` reused, server-side pagination, URL state synced unless intentionally disabled?
- [ ] **Design tokens**: no arbitrary Tailwind colors; semantic tokens used?
- [ ] **Reuse**: dates/masks/BR-value formatting/HTTP client use the established libraries, not reinvented?
- [ ] **Imports**: `@/...` alias instead of long relative paths?
- [ ] **Tests**: `getByRole`/`userEvent`/`findBy*` conventions followed; critical flows have E2E coverage?
