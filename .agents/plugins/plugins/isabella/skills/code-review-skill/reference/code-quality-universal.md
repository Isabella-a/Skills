# Universal Code Quality Anti-Patterns

Stack-agnostic quality anti-patterns covering reuse, leaky abstractions, parameter sprawl, nested conditionals, stringly-typed code, TOCTOU, and no-op updates. Applies to any TypeScript file in this monorepo (`apps/backend` and `apps/frontend`).

## Table of Contents

- [Reuse Audit](#reuse-audit)
- [Parameter Sprawl](#parameter-sprawl)
- [Leaky Abstractions](#leaky-abstractions)
- [Stringly-Typed Code](#stringly-typed-code)
- [Nested Conditionals](#nested-conditionals)
- [Copy-Paste Variants](#copy-paste-variants)
- [No-Op Updates](#no-op-updates)
- [TOCTOU Race Conditions](#toctou-race-conditions)
- [Overly Broad Data Access](#overly-broad-data-access)
- [Redundant State](#redundant-state)
- [Quick Checklist](#quick-checklist)

---

## Reuse Audit

Before accepting new code, search the existing codebase for reusable utilities.

```typescript
// ❌ Hand-rolled debounce — this repo already has one
function debounce(fn: (...args: unknown[]) => void, ms: number) {
  let timer: ReturnType<typeof setTimeout>;
  return (...args: unknown[]) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ✅ Use the existing utility
import { debounce } from '@/lib/utils';
```

```typescript
// ❌ New date formatting helper — date-fns is already the convention
function formatBrDate(d: Date) {
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

// ✅ date-fns
import { format } from 'date-fns';
format(d, 'dd/MM/yyyy');
```

**Review points:**
- Does the new function overlap with an existing utility/hook/component name or purpose?
- Could this inline logic call into an existing module instead?
- Check adjacent files and `src/lib/`, `src/hooks/`, `src/shared/helpers/` before accepting new code.

---

## Parameter Sprawl

```typescript
// ❌ Growing positional parameter list
function renderWidget(
  title: string, width: number, height: number,
  theme: string, collapsible: boolean, icon: string
) { /* ... */ }

// ✅ Options object pattern
interface WidgetOptions {
  title: string;
  width?: number;
  height?: number;
  theme?: 'light' | 'dark';
  collapsible?: boolean;
  icon?: string;
}
function renderWidget(options: WidgetOptions) { /* ... */ }
```

```typescript
// ❌ Backend DTO growing one field at a time with no grouping
async createUser(name: string, email: string, role: string, team: string, active: boolean) {}

// ✅ DTO class groups related fields, defaults live in one place
class CreateUserDto {
  name: string;
  email: string;
  role: Role = Role.MEMBER;
  team?: string;
  active = true;
}
async createUser(dto: CreateUserDto) {}
```

**Review points:**
- Function has 4+ parameters? Consider an options object / DTO.
- New parameter is just another boolean flag? Consider an enum or a strategy instead of `enable_x`/`disable_y` pairs.

---

## Leaky Abstractions

```typescript
// ❌ Returning the raw ORM entity — callers now depend on TypeORM shape
async getUsers(): Promise<UserEntity[]> {
  return this.repo.find({ where: { active: true } });
}

// ✅ Return a domain type, hide the persistence layer
async getActiveUsers(): Promise<UserSummary[]> {
  const rows = await this.repo.find({ where: { active: true } });
  return rows.map(UserSummary.fromEntity);
}
```

```tsx
// ❌ Component receives the raw API response shape
<UserCard user={apiResponse.data.results[0]} />

// ✅ Component receives a domain type; an adapter handles the mapping
interface UserSummary {
  displayName: string;
  avatarUrl: string;
}
<UserCard user={adaptUser(apiResponse)} />
```

**Review points:**
- Does the return type leak the underlying implementation (ORM entity, HTTP client response, file format)?
- Does a component/function depend on an external system's exact data shape?
- Does this break an abstraction boundary that already exists elsewhere in the module?

---

## Stringly-Typed Code

```typescript
// ❌ Magic strings scattered across files
if (status === 'active') { /* ... */ }
if (role === 'admin') { /* ... */ }

// ✅ Enum / union type
enum Status {
  Active = 'active',
  Suspended = 'suspended',
  Archived = 'archived',
}
if (user.status === Status.Active) { /* ... */ }
```

```typescript
// ❌ Raw event name strings — a typo doesn't get caught
emitter.emit('userCreated', data);
emitter.on('usercreated', handler); // bug: typo, silently never fires

// ✅ Const object / branded values
const Events = {
  UserCreated: 'userCreated',
  UserSuspended: 'userSuspended',
} as const;
emitter.emit(Events.UserCreated, data);
```

**Review points:**
- Is a raw string replacing an existing enum/union type/const object (e.g. `EventEnum` for pg-boss events)?
- Are status/action/event-type values duplicated across multiple files instead of defined once?
- Is a string comparison silently case-sensitive without being validated as such?

---

## Nested Conditionals

```typescript
// ❌ Nested ternary chain
const label = isHovered
  ? isSelected ? 'blue' : 'gray'
  : isSelected ? 'navy' : 'white';

// ✅ Lookup table
const bgMap: Record<string, string> = {
  'true-true': 'blue',
  'true-false': 'gray',
  'false-true': 'navy',
  'false-false': 'white',
};
const label = bgMap[`${isHovered}-${isSelected}`];
```

```typescript
// ❌ 3+ levels of nested if
function process(order: Order | null) {
  if (order !== null) {
    if (order.items.length > 0) {
      for (const item of order.items) {
        if (item.price > 0) {
          /* ... */
        }
      }
    }
  }
}

// ✅ Early return + guard clauses
function process(order: Order | null) {
  if (!order || !order.items.length) return;
  for (const item of order.items) {
    if (item.price <= 0) continue;
    /* ... */
  }
}
```

**Review points:**
- Ternary nesting ≥ 2 levels?
- `if`/`else` nesting ≥ 3 levels?
- Could a lookup table, early return, or discriminated union replace the branching?

---

## Copy-Paste Variants

```typescript
// ❌ Copy-paste handler that only changed the resource name
async function deletePost(id: string) {
  await api.delete(`/posts/${id}`);
  router.push('/posts');
}
async function deleteComment(id: string) {
  await api.delete(`/comments/${id}`);
  router.push('/comments');
}

// ✅ Parametrized
async function deleteResource(resource: string, id: string) {
  await api.delete(`/${resource}/${id}`);
  router.push(`/${resource}`);
}
```

**Review points:**
- Are there 2+ blocks that only differ in variable name / URL / string?
- Could a parametrized shared function replace the variants?

---

## No-Op Updates

```tsx
// ❌ Every poll triggers a state update, even when the data hasn't changed
useEffect(() => {
  const interval = setInterval(() => {
    fetch('/api/status').then((r) => r.json()).then(setStatus);
  }, 5000);
  return () => clearInterval(interval);
}, []);

// ✅ Only update when the value actually changed
useEffect(() => {
  const interval = setInterval(() => {
    fetch('/api/status')
      .then((r) => r.json())
      .then((data) => setStatus((prev) => (isEqual(prev, data) ? prev : data)));
  }, 5000);
  return () => clearInterval(interval);
}, []);
```

```typescript
// ❌ Writing to the DB on every loop iteration, even when unchanged
for (const item of items) {
  item.status = computeStatus(item);
  await repo.save(item);
}

// ✅ Only write when the value changed
for (const item of items) {
  const newStatus = computeStatus(item);
  if (item.status !== newStatus) {
    item.status = newStatus;
    await repo.save(item);
  }
}
```

**Review points:**
- Does a polling/interval/event handler update unconditionally?
- Does a wrapper function respect same-reference returns to avoid unnecessary re-renders?
- Do DB writes check for an actual change before writing?

---

## TOCTOU Race Conditions

Time-of-check-to-time-of-use gaps.

```typescript
// ❌ Check-then-act is not atomic in an async context
if (!(await fileExists(path))) {
  await writeFile(path, content);
}

// ✅ Operate directly, handle the failure
try {
  await writeFile(path, content, { flag: 'wx' });
} catch (e) {
  if ((e as NodeJS.ErrnoException).code === 'EEXIST') { /* handle */ }
  else throw e;
}
```

```typescript
// ❌ Check balance → debit is not atomic
if (account.balance >= amount) {
  account.balance -= amount;
}

// ✅ Wrap in a transaction / UnitOfWork
await this.unitOfWork.exec(async (uow) => {
  this.accountRepo.setContext(uow.getContext());
  const account = await this.accountRepo.findByIdForUpdate(id);
  if (account.balance < amount) throw new InsufficientFundsError();
  account.balance -= amount;
  await this.accountRepo.save(account);
});
```

**Review points:**
- Can an `if exists → operate` pattern be replaced with `try operate → catch`?
- Are multi-step state changes wrapped in a transaction/`UnitOfWork` rather than being two separate awaited steps?
- Is there an `await` between the check and the act in async code?

---

## Overly Broad Data Access

```typescript
// ❌ Loading everything, then filtering in memory
const allItems = await orderRepository.find();
const pending = allItems.filter((o) => o.status === 'pending');

// ✅ Filter at the database layer
const pending = await orderRepository.find({ where: { status: 'pending' } });
```

**Review points:**
- Is an entire collection/file read just to use a small subset?
- Could the filtering be pushed down to the database/storage layer?
- Does the API call support pagination/limit parameters instead of returning everything?

---

## Redundant State

```typescript
// ❌ Storing both fullName and firstName + lastName
interface User {
  firstName: string;
  lastName: string;
  fullName: string; // redundant
}

// ✅ Derive it
interface User {
  firstName: string;
  lastName: string;
}
const fullName = `${user.firstName} ${user.lastName}`;
```

```typescript
// ❌ Cached value can go stale relative to its source
class Order {
  total: number;
  itemCount: number; // redundant if items.length gives the same
  items: Item[];
}

// ✅ Derive via a getter
class Order {
  items: Item[];
  get total() { return this.items.reduce((sum, i) => sum + i.price, 0); }
  get itemCount() { return this.items.length; }
}
```

**Review points:**
- Is a field derivable from other fields already present?
- Does a cached value have an invalidation mechanism?
- Could an effect/observer be replaced with a direct call?

---

## Quick Checklist

- [ ] **Reuse audit**: searched for existing utility/hook/component before writing new code?
- [ ] **Parameter count**: functions ≤ 3 params? Options object/DTO used beyond that?
- [ ] **Abstraction boundary**: return types don't leak ORM entities, HTTP responses, or other internal shapes?
- [ ] **Type safety**: no magic strings replacing an existing enum/const/union type?
- [ ] **Conditional depth**: ternary nesting ≤ 1 level? if/else nesting ≤ 2 levels?
- [ ] **DRY**: no copy-paste-with-variation (2+ near-identical blocks)?
- [ ] **No-op guard**: polling/interval/event handlers have a change-detection guard?
- [ ] **TOCTOU**: `if exists → operate` replaced with `try operate → catch`, or wrapped in a transaction?
- [ ] **Data scope**: no reading an entire collection/file just to use a subset?
- [ ] **Redundant state**: no stored field that could be derived from others?
