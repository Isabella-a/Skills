# NestJS / Backend Review Guide (`apps/backend`)

Review guide scoped to this repo's backend: NestJS 11, TypeScript, TypeORM (PostgreSQL) + Kysely (SQLite reads), Zod, Vitest, pg-boss. For the full architecture reference, see `apps/backend/CLAUDE.md`.

## Table of Contents

- [Either Pattern](#either-pattern)
- [Unit of Work](#unit-of-work)
- [Pub/Sub with pg-boss](#pubsub-with-pg-boss)
- [Module / Context Structure](#module--context-structure)
- [DTO Validation](#dto-validation)
- [TypeORM / Kysely Queries](#typeorm--kysely-queries)
- [Migrations](#migrations)
- [Dependency Injection & Circular Dependencies](#dependency-injection--circular-dependencies)
- [Testing](#testing)
- [Review Checklist](#review-checklist)

---

## Either Pattern

Services in this codebase return `Either<ErrorType, SuccessType>` (see `src/shared/helpers/either.ts`) instead of throwing for expected failure paths. Controllers check `.isErr()` / `.isOk()` and map to HTTP responses.

```typescript
// ❌ Service throws for an expected business error — controller has to try/catch
async execute(id: string): Promise<User> {
  const user = await this.repo.findById(id);
  if (!user) throw new NotFoundException('User not found');
  return user;
}

// ✅ Service returns Either — controller maps explicitly
async execute(id: string): Promise<Either<UserNotFoundError, User>> {
  const user = await this.repo.findById(id);
  if (!user) return Err(new UserNotFoundError(id));
  return Ok(user);
}
```

**Review points:**
- New services in an existing module follow the same `Either` convention as sibling contexts — don't mix `throw` and `Either` in the same layer.
- Controllers handle both branches (`isErr()`/`isOk()`) — an unhandled `Err` branch silently returns `undefined`.
- Only genuinely *exceptional* failures (infra errors, programmer errors) should throw; expected business failures (not found, validation, conflict) go through `Either`.

---

## Unit of Work

Operations spanning multiple repositories must use `UnitOfWork.exec()` to wrap them in a single atomic transaction (ADR #2). Repositories call `setContext(uow.getContext())` before operating inside the transaction.

```typescript
// ❌ Two repositories written outside a transaction — partial failure leaves inconsistent state
await this.walletRepo.create(wallet);
await this.userRepo.update(user);

// ✅ Wrapped in UnitOfWork — atomic
await this.unitOfWork.exec(async (uow) => {
  this.walletRepo.setContext(uow.getContext());
  this.userRepo.setContext(uow.getContext());
  await this.walletRepo.create(wallet);
  await this.userRepo.update(user);
});
```

**Review points:**
- Any service method that writes to 2+ repositories in sequence — is it wrapped in `UnitOfWork.exec()`?
- Is `setContext()` called on every repository used inside the transaction, not just the first one?
- Are secondary effects (emails, HubSpot sync, notifications) *outside* the transaction, published via pg-boss instead (see below)?

---

## Pub/Sub with pg-boss

Secondary effects must **not** run inside the main transactional flow (ADR #1). Publish domain events via `PubSubService.publish(EventEnum.Name, data)`; consumers extend `BaseConsumer` and register in `onModuleInit`.

```typescript
// ❌ Sending an email inside the transactional service — couples core flow to email delivery
await this.unitOfWork.exec(async (uow) => {
  await this.userRepo.create(user);
  await this.emailService.sendWelcome(user.email); // side effect inside the transaction
});

// ✅ Publish an event, let a consumer handle the side effect asynchronously
await this.unitOfWork.exec(async (uow) => {
  await this.userRepo.create(user);
});
await this.pubSub.publish(EventEnum.UserCreated, { userId: user.id });
```

**Review points:**
- Are emails, HubSpot syncs, notifications, or other non-core side effects invoked directly inside a service/transaction instead of published as an event?
- Does the consumer extend `BaseConsumer` and get registered in `onModuleInit`?
- Is the event name added to `EventEnum` rather than a raw string?

---

## Module / Context Structure

Each domain module lives under `src/modules/<module>/`, organized around **use-case contexts**:

```
src/modules/<module>/
  contexts/
    <use-case>/
      <use-case>.controller.ts
      <use-case>.service.ts
      dtos/
      tests/          # unit and e2e specs co-located with the context
  consumers/          # pg-boss event consumers
  services/           # cross-context services (optional)
  types/
  <module>.module.ts
```

**Review points:**
- New use cases live in their own `contexts/<use-case>/` folder — don't bolt unrelated logic onto an existing context's controller/service.
- Cross-context logic within the same module goes in `services/`, not duplicated per context.
- Repositories are abstract classes with `*Impl` implementations injected via NestJS DI tokens (see `src/shared/modules/database/`) — new repositories should follow this, not instantiate a concrete ORM client directly in a service.

---

## DTO Validation

Request DTOs use `class-validator`/`class-transformer` decorators (or Zod, for env validation). Every controller input should be validated at the boundary.

```typescript
// ❌ Untyped/unvalidated request body
async create(@Body() body: any) { ... }

// ✅ Validated DTO
class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(3)
  name: string;
}
async create(@Body() dto: CreateUserDto) { ... }
```

**Review points:**
- Every new endpoint has a DTO class with validation decorators — no `@Body() body: any`.
- Optional vs required fields match the actual business rule (`@IsOptional()` only where genuinely optional).
- Env vars are validated through the existing Zod schema in `config/`, not read raw via `process.env.X` in business code.

---

## TypeORM / Kysely Queries

```typescript
// ❌ N+1 — one query per user in the loop
const users = await userRepository.find();
for (const user of users) {
  const posts = await user.posts; // lazy-loaded relation, queried per iteration
}

// ✅ Eager loading
const users = await userRepository.find({ relations: ['posts'] });
```

```typescript
// ❌ Loading everything into memory to filter
const all = await orderRepository.find();
const pending = all.filter((o) => o.status === 'pending');

// ✅ Filter at the query layer
const pending = await orderRepository.find({ where: { status: 'pending' } });
```

**Review points:**
- Any loop that triggers a query per iteration (TypeORM lazy relations, Kysely calls inside `for`)?
- List endpoints paginated, not returning entire tables?
- SQLite (Kysely) reads used for data-lake/read-only queries, not as a substitute for the primary Postgres/TypeORM store?

---

## Migrations

Migrations live in `infra/database/migrations/` (Postgres/TypeORM) or `infra/database/sqlite-migrations/` (Kysely). New Postgres migrations must be manually added to `test/setup-e2e.ts` for e2e tests to run them.

**Review points:**
- Was the migration **generated** (`npm run migration:run && npm run migration:generate --name=X`) rather than hand-written? See `apps/backend/CLAUDE.md` for the exact sequence and the `--name=` gotcha (no `-- --name=`).
- Is the migration added to `test/setup-e2e.ts`?
- Does a follow-up `migration:generate --name=test` come up empty (no schema drift)? If it generates a migration, that's a sync failure — flag it, don't silently accept the extra migration.
- Destructive changes (dropping columns/tables) — is there a safe rollout plan (backfill first, drop later)?

---

## Dependency Injection & Circular Dependencies

```typescript
// ❌ Manual instantiation bypasses DI, breaks testability
class OrderService {
  private repo = new OrderRepositoryImpl();
}

// ✅ Constructor injection
class OrderService {
  constructor(private readonly repo: OrderRepository) {}
}
```

**Review points:**
- All dependencies injected via constructor, not `new`'d directly.
- No circular module imports (`ModuleA` importing `ModuleB` which imports `ModuleA`) — if genuinely needed, use `forwardRef()` and flag it for a second look.

---

## Testing

- Unit tests: `**/*.spec.ts` (Vitest), co-located in each context's `tests/` folder.
- E2E tests: `**/*.e2e-spec.ts`, run against a real Postgres DB (`.env.test`).

**Review points:**
- New use-case contexts include at least a unit spec for the service and, for critical flows, an e2e spec.
- Tests assert on `Either` branches explicitly (`result.isOk()` / `result.isErr()` + payload), not just "didn't throw".
- E2E tests don't depend on execution order or leftover state from a previous test (setup truncates tables after each test — don't work around that).

---

## Review Checklist

- [ ] **Either pattern**: service failures use `Either`, not mixed throw/Either in the same layer?
- [ ] **Unit of Work**: multi-repository writes wrapped in `UnitOfWork.exec()`, with `setContext()` on every repo used?
- [ ] **Pub/Sub**: secondary effects (email, HubSpot, notifications) published via pg-boss, not inline in the transaction?
- [ ] **Module structure**: new use case in its own `contexts/<use-case>/` folder?
- [ ] **DTO validation**: every controller input validated, no `@Body() body: any`?
- [ ] **N+1**: no per-iteration queries; list endpoints paginated?
- [ ] **Migrations**: generated (not hand-written), added to `test/setup-e2e.ts`, no schema drift on `--name=test`?
- [ ] **DI**: constructor injection everywhere, no circular imports without `forwardRef()`?
- [ ] **Tests**: unit spec for new services, e2e for critical flows, `Either` branches asserted explicitly?
