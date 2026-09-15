# Architecture Review Guide

Guidance for evaluating whether a change's architecture and design are sound, applicable to both `apps/backend` (NestJS) and `apps/frontend` (Next.js).

## SOLID Checklist

### S — Single Responsibility

**Check:**
- Does this class/module have only one reason to change?
- Do its methods all serve the same purpose?
- Could you describe it in one sentence to a non-technical person?

**Warning signs:**
```
⚠️ Class name contains "And", "Manager", "Handler", "Processor"
⚠️ A class/file over 200-300 lines
⚠️ A class with more than 5-7 public methods
⚠️ Different methods operate on completely unrelated data
```

**Questions to ask:**
- "What is this class responsible for? Could it be split?"
- "If requirement X changes, which methods need to change? What about requirement Y?"

### O — Open/Closed

**Check:**
- Does adding a new feature require modifying existing code, or can it extend it?
- Is there a growing `if/else`/`switch` chain handling different types?

**Warning signs:**
```
⚠️ switch/if-else chains dispatching on type
⚠️ Adding a new feature requires editing a core class
⚠️ Type checks (instanceof, typeof) scattered through the code
```

### L — Liskov Substitution

**Check:**
- Can a subclass fully replace its parent without breaking callers?
- Does a subclass throw exceptions the parent contract doesn't declare?

**Warning signs:**
```
⚠️ Explicit casting
⚠️ Subclass method throws NotImplemented / empty body
⚠️ Call sites need to check the concrete type before using the base type
```

### I — Interface Segregation

**Check:**
- Is the interface small and focused?
- Are implementers forced to implement methods they don't need?

**Warning signs:**
```
⚠️ Interface with more than 5-7 methods
⚠️ Implementer has empty methods or throws NotImplemented
⚠️ Interface name is overly generic (IManager, IService)
```

### D — Dependency Inversion

**Check:**
- Do high-level modules depend on abstractions, not concrete implementations?
- Is dependency injection used instead of `new`-ing concrete classes directly?

**Warning signs:**
```
⚠️ A service directly `new`s a concrete repository/client
⚠️ Importing a concrete implementation instead of an interface/abstract class
⚠️ Connection strings/config hardcoded in business logic
⚠️ A class that's hard to unit test because its dependencies can't be mocked
```

**In this repo:** backend repositories are abstract classes with `*Impl` implementations, injected via NestJS DI tokens (`src/shared/modules/database/`) — a new repository that skips this pattern is a DIP violation worth flagging.

---

## Architectural Anti-Patterns

### Critical

| Anti-Pattern | Signal | Impact |
|---|---|---|
| **Big Ball of Mud** | No clear module boundaries, any code can call any other code | Hard to understand, change, and test |
| **God Object** | A single class knows/does too much | High coupling, hard to reuse and test |
| **Spaghetti Code** | Tangled control flow, deep nesting, hard to trace | Hard to understand and maintain |
| **Lava Flow** | Old code nobody dares touch, no docs/tests | Accumulating tech debt |

### Design

| Anti-Pattern | Signal | Suggestion |
|---|---|---|
| **Golden Hammer** | Same technique/pattern applied to every problem | Pick the tool that fits the problem |
| **Gas Factory** | Simple problem solved with an overengineered design | YAGNI — start simple |
| **Boat Anchor** | Code kept "in case we need it later" | Delete unused code; write it when actually needed |
| **Copy-Paste Programming** | The same logic duplicated in multiple places | Extract a shared function/module |

### Review Prompts

```markdown
🔴 [blocking] "This class is 2000 lines — consider splitting into focused classes."
🟡 [important] "This logic is duplicated in 3 places — extract a shared function?"
💡 [suggestion] "This switch could become a strategy map, easier to extend."
```

---

## Coupling & Cohesion

### Coupling Types (best to worst)

| Type | Description | Example |
|---|---|---|
| **Message coupling** ✅ | Data passed via parameters | `calculate(price, quantity)` |
| **Data coupling** ✅ | Shared simple data structures | `processOrder(orderDto)` |
| **Stamp coupling** ⚠️ | Shares a complex structure but only uses part of it | Passing the whole `User` entity to use just `name` |
| **Control coupling** ⚠️ | Passing flags that steer behavior | `process(data, isAdmin=true)` |
| **Common coupling** ❌ | Shared global/mutable state | Multiple modules reading/writing the same global |
| **Content coupling** ❌ | Reaching into another module's internals | Directly mutating another class's private fields |

### Cohesion Types (best to worst)

| Type | Description | Quality |
|---|---|---|
| **Functional** | All elements serve a single task | ✅ Best |
| **Sequential** | Output feeds the next step | ✅ Good |
| **Communicational** | Operates on the same data | ⚠️ Acceptable |
| **Temporal** | Grouped by "runs at the same time" | ⚠️ Weak |
| **Logical** | Related in category, not in behavior | ❌ Poor |
| **Coincidental** | No clear relationship | ❌ Worst |

### Review Questions

- "How many other modules does this module depend on? Can that be reduced?"
- "How much would changing this class affect the rest of the system?"
- "Do this class's methods all operate on the same data?"

---

## Layering Review

### Clean Architecture layers

```
┌─────────────────────────────────────┐
│         Frameworks & Drivers        │ ← outermost: Web, DB, UI
├─────────────────────────────────────┤
│         Interface Adapters          │ ← Controllers, Gateways, Presenters
├─────────────────────────────────────┤
│          Application Layer          │ ← Use cases, application services
├─────────────────────────────────────┤
│            Domain Layer             │ ← Entities, domain services
└─────────────────────────────────────┘
          ↑ dependencies point inward only ↑
```

### Dependency Rule

```typescript
// ❌ Violates the dependency rule: domain depends on infrastructure
// domain/User.ts
import { PostgresConnection } from '../infrastructure/database';

// ✅ Domain defines the interface, infrastructure implements it
// domain/UserRepository.ts (interface)
interface UserRepository {
  findById(id: string): Promise<User>;
}

// infrastructure/TypeOrmUserRepository.ts (implementation)
class TypeOrmUserRepositoryImpl implements UserRepository {
  findById(id: string): Promise<User> { /* ... */ }
}
```

### Boundary Checklist

- [ ] Does the domain layer have external dependencies (DB, HTTP, filesystem)?
- [ ] Does the application layer touch the database or call external APIs directly?
- [ ] Does a controller contain business logic that belongs in a service?
- [ ] Is there a cross-layer call (UI calling a repository directly)?

**Frontend equivalent:** does a Server Component/page contain business logic that should live in a hook or a shared lib function? Does a component reach into `src/lib/api` internals instead of going through the established hook?

### Review Prompts

```markdown
🔴 [blocking] "The domain entity imports the DB connection directly — violates the dependency rule."
🟡 [important] "This controller does business calculation — move it to the service layer."
💡 [suggestion] "Consider dependency injection to decouple these components."
```

---

## Design Pattern Usage

### When to Use

| Pattern | Fits | Doesn't Fit |
|---|---|---|
| **Factory** | Multiple object types decided at runtime | Only one type, or a fixed type |
| **Strategy** | Algorithm swappable at runtime, multiple interchangeable behaviors | Only one algorithm, never changes |
| **Observer** | One-to-many dependency, state change needs to notify multiple objects | A simple direct call already satisfies the need |
| **Singleton** | A genuinely global unique instance (e.g. config) | Something DI could inject instead |
| **Decorator** | Dynamic responsibility addition, avoiding inheritance explosion | Fixed responsibilities, no dynamic composition needed |

### Overengineering Warning Signs

```
⚠️ "Patternitis" signals:

1. A simple if/else replaced by strategy + factory + registry
2. An interface with only one implementation
3. An abstraction layer added "in case we need it later"
4. Line count balloons because of pattern application
5. New team members take a long time to understand the structure
```

### Review Prompts

```markdown
✅ Pattern used well:
- Solves an actual extensibility problem
- Code is easier to understand and test
- Adding a new feature becomes simpler

❌ Pattern overused:
- Used for the sake of using it
- Adds unnecessary complexity
- Violates YAGNI
```

---

## Extensibility

### Checklist

**Feature extensibility:**
- [ ] Does adding a feature require touching core code?
- [ ] Are there extension points (hooks, plugins, events)?
- [ ] Is config externalized (config files, env vars)?

**Data extensibility:**
- [ ] Does the data model support new fields?
- [ ] Was data growth considered?
- [ ] Do queries have appropriate indexes?

**Load extensibility:**
- [ ] Can it scale horizontally (more instances)?
- [ ] Any state dependency (session, local cache)?
- [ ] Are DB connections pooled?

```typescript
// ✅ Good extension design: event/hook based
class OrderService {
  constructor(private hooks: OrderHooks) {}
  async createOrder(order: Order) {
    await this.hooks.beforeCreate?.(order);
    const result = await this.save(order);
    await this.hooks.afterCreate?.(result);
    return result;
  }
}

// ❌ Poor extension design: all behavior hardcoded
class OrderService {
  async createOrder(order: Order) {
    await this.sendEmail(order);
    await this.updateInventory(order);
    await this.notifyWarehouse(order);
    return this.save(order);
  }
}
```

**In this repo:** hardcoded side effects like the example above should instead be published as pg-boss events (see [NestJS Guide](nestjs-typescript.md#pubsub-with-pg-boss)) — that *is* this codebase's extension point for secondary effects.

---

## Code Structure Practices

### Directory Organization

**By feature/domain (this repo's backend convention):**
```
src/modules/
  user/
    contexts/
      create/
      list/
  order/
    contexts/
      ...
shared/
  helpers/
  modules/
```

**By technical layer (not this repo's convention):**
```
src/
  controllers/     ← different domains mixed together
  services/
  repositories/
```

### Naming Conventions

| Type | Convention | Example |
|---|---|---|
| Class name | PascalCase, noun | `UserService`, `OrderRepository` |
| Method name | camelCase, verb | `createUser`, `findOrderById` |
| Interface name | With or without `I` prefix | `IUserService` or `UserService` |
| Constant | UPPER_SNAKE_CASE | `MAX_RETRY_COUNT` |
| Private field | Underscore prefix or `#` | `_cache` or `#cache` |

### File Size Guidance

```yaml
suggested limits:
  file: < 300 lines
  function: < 50 lines
  class: < 200 lines
  function params: < 4
  nesting depth: < 4

when exceeded:
  - split into smaller units
  - favor composition over inheritance
  - extract helper functions/classes
```

### Review Prompts

```markdown
🟢 [nit] "This 500-line file could be split by responsibility."
🟡 [important] "Prefer organizing by feature/domain, not by technical layer."
💡 [suggestion] "`process` isn't specific enough — `calculateOrderTotal`?"
```

---

## Quick Reference

### 5-minute architecture pass

```markdown
□ Dependencies point in the right direction (outer → inner)?
□ Any circular dependencies?
□ Is core business logic decoupled from framework/UI/DB?
□ SOLID respected?
□ Any obvious anti-pattern present?
```

### Red flags (must fix)

```markdown
🔴 God Object — a single class over 1000 lines
🔴 Circular dependency — A → B → C → A
🔴 Domain layer with framework dependencies
🔴 Hardcoded config/secrets
🔴 External service call with no interface
```

### Yellow flags (should fix)

```markdown
🟡 Coupling between classes (CBO) > 10
🟡 More than 5 method parameters
🟡 Nesting depth over 4
🟡 Duplicated code block > 10 lines
🟡 An interface with only one implementation
```

---

## Tooling

| Tool | Purpose |
|---|---|
| **ESLint** | Style rules, complexity checks |
| **Madge** | Module dependency graph (JS/TS) |
| **SonarQube** | Code quality, coupling analysis (multi-language) |

---

## References

- [Clean Architecture — Uncle Bob](https://blog.cleancoder.com/uncle-bob/2012/08/13/the-clean-architecture.html)
- [SOLID Principles in Code Review — JetBrains](https://blog.jetbrains.com/upsource/2015/08/31/what-to-look-for-in-a-code-review-solid-principles-2/)
- [Coupling and Cohesion in System Design](https://www.geeksforgeeks.org/system-design/coupling-and-cohesion-in-system-design/)
- [Design Patterns — Refactoring Guru](https://refactoring.guru/design-patterns)
