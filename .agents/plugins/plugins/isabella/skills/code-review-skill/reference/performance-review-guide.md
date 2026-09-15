# Performance Review Guide

Performance review guidance covering frontend (Next.js/React), backend (NestJS/TypeORM/Kysely), and algorithmic complexity.

## Table of Contents

- [Frontend Performance (Core Web Vitals)](#frontend-performance-core-web-vitals)
- [JavaScript Performance](#javascript-performance)
- [Memory Management](#memory-management)
- [Database Performance](#database-performance)
- [API Performance](#api-performance)
- [Algorithmic Complexity](#algorithmic-complexity)
- [Review Checklist](#review-checklist)

---

## Frontend Performance (Core Web Vitals)

| Metric | Full name | Target | Meaning |
|---|---|---|---|
| **LCP** | Largest Contentful Paint | ≤ 2.5s | Time to render the largest visible element |
| **INP** | Interaction to Next Paint | ≤ 200ms | Responsiveness to interaction |
| **CLS** | Cumulative Layout Shift | ≤ 0.1 | Visual stability |
| **FCP** | First Contentful Paint | ≤ 1.8s | Time to first rendered content |
| **TBT** | Total Blocking Time | ≤ 200ms | Main-thread blocking time |

### LCP

```tsx
// ❌ Lazy-loading the LCP image delays the largest content
<img src="hero.jpg" loading="lazy" />

// ✅ Prioritize the LCP element
<Image src="hero.jpg" priority />
```

**Review points:**
- [ ] Is the LCP element marked with `priority`/`fetchpriority="high"` (Next.js `<Image priority />`)?
- [ ] Is the App Router leveraging Server Components / static generation where it fits, instead of client-fetching everything?
- [ ] Are images served through `next/image` (automatic WebP/AVIF, responsive sizes)?

### CLS

```tsx
// ❌ No reserved space for media
<img src={url} className="w-full" />

// ✅ Reserve space via Next.js Image dimensions or aspect-ratio
<Image src={url} width={640} height={360} alt="" />
```

**Review points:**
- [ ] Do images/embeds have explicit dimensions or `aspect-ratio`?
- [ ] Does dynamically inserted content (banners, async widgets) reserve space to avoid shifting existing content?

### INP

```tsx
// ❌ A long synchronous handler blocks the main thread
function onClick() {
  processLargeData(data); // 500ms synchronous work
  updateUI();
}

// ✅ Break up long work / offload it
async function onClick() {
  await Promise.resolve(); // yield to the main thread
  for (const chunk of chunks) {
    processChunk(chunk);
    await Promise.resolve();
  }
  updateUI();
}
```

**Review points:**
- [ ] Does a click/input handler run expensive synchronous work directly on the main thread?
- [ ] Could heavy computation be chunked, deferred, or moved to a Web Worker?

---

## JavaScript Performance

### Code Splitting & Lazy Loading

```tsx
// ❌ Everything imported eagerly
import { HeavyChart } from './charts';
import { PdfExporter } from './pdf';

// ✅ Load on demand
const HeavyChart = dynamic(() => import('./charts'));
const PdfExporter = dynamic(() => import('./pdf'));
```

### Bundle Size

```typescript
// ❌ Importing an entire library
import _ from 'lodash';

// ✅ Import only what's needed
import debounce from 'lodash/debounce';
```

**Review points:**
- [ ] Heavy, rarely-used components (charts, PDF export, admin-only panels) dynamically imported?
- [ ] Large libraries imported piecemeal, not as a whole barrel?
- [ ] Any newly introduced dependency that duplicates something already in `package.json`?

### List Rendering

```tsx
// ❌ Rendering a large list fully — 10,000 items = 10,000 DOM nodes
function List({ items }: { items: Item[] }) {
  return <ul>{items.map((item) => <li key={item.id}>{item.name}</li>)}</ul>;
}

// ✅ Reuse this repo's DataTable (paginated server-side) instead of rendering everything client-side
```

**Review points:**
- [ ] Lists over ~100 items paginated (server-side, per this repo's `DataTable` convention) rather than rendered in full?
- [ ] No unnecessary full re-renders of large lists on every keystroke/filter change?

---

## Memory Management

### Common Leaks

```tsx
// ❌ Event listener never removed
useEffect(() => {
  window.addEventListener('resize', handleResize);
}, []);

// ✅ Cleaned up
useEffect(() => {
  window.addEventListener('resize', handleResize);
  return () => window.removeEventListener('resize', handleResize);
}, []);
```

```tsx
// ❌ Timer never cleared
useEffect(() => {
  setInterval(fetchData, 5000);
}, []);

// ✅ Cleared on unmount
useEffect(() => {
  const timer = setInterval(fetchData, 5000);
  return () => clearInterval(timer);
}, []);
```

```tsx
// ❌ WebSocket/EventSource never closed
useEffect(() => {
  const ws = new WebSocket('wss://...');
  ws.onmessage = handleMessage;
}, []);

// ✅ Connection closed on cleanup
useEffect(() => {
  const ws = new WebSocket('wss://...');
  ws.onmessage = handleMessage;
  return () => ws.close();
}, []);
```

**Review checklist:**
```markdown
- [ ] Every useEffect that subscribes to something has a cleanup function?
- [ ] Event listeners removed on unmount?
- [ ] Timers cleared?
- [ ] WebSocket/SSE connections closed?
- [ ] No global variable accumulating data over the app's lifetime?
```

---

## Database Performance

### N+1 Queries

```typescript
// ❌ N+1 — 1 + N queries
const users = await userRepository.find(); // 1 query
for (const user of users) {
  const profile = await user.profile; // N queries, one per user
}

// ✅ Eager loading — 1 query
const users = await userRepository.find({ relations: ['profile'] });
```

### Indexing

```sql
-- ❌ Full table scan
SELECT * FROM orders WHERE status = 'pending';

-- ✅ Indexed column
CREATE INDEX idx_orders_status ON orders(status);

-- ❌ Index defeated by a function wrapping the column
SELECT * FROM users WHERE EXTRACT(YEAR FROM created_at) = 2024;

-- ✅ Range query — can use the index
SELECT * FROM users WHERE created_at >= '2024-01-01' AND created_at < '2025-01-01';
```

### Query Shape

```sql
-- ❌ SELECT * fetching unneeded columns
SELECT * FROM users WHERE id = 1;

-- ✅ Only the needed columns
SELECT id, name, email FROM users WHERE id = 1;

-- ❌ Large table with no LIMIT
SELECT * FROM audit_logs WHERE type = 'error';

-- ✅ Paginated
SELECT * FROM audit_logs WHERE type = 'error' LIMIT 100 OFFSET 0;
```

```typescript
// ❌ Query executed once per loop iteration
for (const id of userIds) {
  await db.query('SELECT * FROM users WHERE id = $1', [id]);
}

// ✅ Batched
await db.query('SELECT * FROM users WHERE id = ANY($1)', [userIds]);
```

**Review checklist:**
```markdown
🔴 Must check:
- [ ] Any N+1 query pattern (TypeORM lazy relations, Kysely calls inside a loop)?
- [ ] Do WHERE columns have an index?
- [ ] Is SELECT * avoided on large tables?
- [ ] Do large-table queries have a LIMIT/pagination?

🟡 Should check:
- [ ] Was EXPLAIN used to check the query plan for anything non-trivial?
- [ ] Composite index column order correct for the query pattern?
- [ ] Any unused indexes accumulating write overhead?
```

---

## API Performance

### Pagination

```typescript
// ❌ Returning everything
@Get()
async findAll() {
  return this.repo.find(); // could return 100,000 rows
}

// ✅ Paginated, with a max page size
@Get()
async findAll(@Query('page') page = 1, @Query('limit') limit = 20) {
  const safeLimit = Math.min(limit, 100);
  return this.repo.find({ take: safeLimit, skip: (page - 1) * safeLimit });
}
```

### Caching

```typescript
// ✅ Cache module usage (this repo's existing cache module in src/shared/modules/cache/)
async getUser(id: string) {
  const cached = await this.cache.get(`user:${id}`);
  if (cached) return cached;

  const user = await this.userRepo.findById(id);
  await this.cache.set(`user:${id}`, user, { ttl: 3600 });
  return user;
}
```

### Response Shape

```typescript
// ✅ Only return fields actually needed by the client
@Get()
async findAll(@Query('fields') fields?: string) {
  const select = fields?.split(',') ?? ['id', 'name'];
  return this.repo.find({ select });
}
```

**Review checklist:**
```markdown
- [ ] Do list endpoints paginate?
- [ ] Is a max page size enforced?
- [ ] Is hot/repeated data cached where it makes sense?
- [ ] Are only the fields the client needs returned?
```

---

## Algorithmic Complexity

### Complexity Comparison

| Complexity | Name | 10 items | 1,000 items | 1M items | Example |
|---|---|---|---|---|---|
| O(1) | Constant | 1 | 1 | 1 | Hash lookup |
| O(log n) | Logarithmic | 3 | 10 | 20 | Binary search |
| O(n) | Linear | 10 | 1,000 | 1M | Array scan |
| O(n log n) | Log-linear | 33 | 10,000 | 20M | Quicksort |
| O(n²) | Quadratic | 100 | 1M | 1 trillion | Nested loops |
| O(2ⁿ) | Exponential | 1,024 | ∞ | ∞ | Naive recursive Fibonacci |

### Spotting It in Review

```typescript
// ❌ O(n²) — nested loop
function findDuplicates(arr: number[]) {
  const duplicates: number[] = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j]) duplicates.push(arr[i]);
    }
  }
  return duplicates;
}

// ✅ O(n) — using a Set
function findDuplicates(arr: number[]) {
  const seen = new Set<number>();
  const duplicates = new Set<number>();
  for (const item of arr) {
    if (seen.has(item)) duplicates.add(item);
    seen.add(item);
  }
  return [...duplicates];
}
```

```typescript
// ❌ O(n) lookup repeated inside a loop — overall O(n²)
function removeDuplicates(arr: string[]) {
  const result: string[] = [];
  for (const item of arr) {
    if (!result.includes(item)) result.push(item); // includes() is O(n)
  }
  return result;
}

// ✅ O(n)
function removeDuplicates(arr: string[]) {
  return [...new Set(arr)];
}
```

```typescript
// ❌ O(n) lookup — scans on every call
const users = [{ id: 1, name: 'A' }, { id: 2, name: 'B' }];
function getUser(id: number) {
  return users.find((u) => u.id === id); // O(n)
}

// ✅ O(1) lookup via Map
const userMap = new Map(users.map((u) => [u.id, u]));
function getUser(id: number) {
  return userMap.get(id); // O(1)
}
```

### Review Prompts

```markdown
💡 "This nested loop is O(n²) — could become a performance issue at scale."
🔴 "Array.includes() inside a loop makes this O(n²) overall — consider a Set."
🟡 "This recursion depth could risk a stack overflow — iterate instead?"
```

---

## Review Checklist

### 🔴 Must check (blocking)

**Frontend:**
- [ ] LCP image lazy-loaded? (it shouldn't be)
- [ ] `transition: all` anywhere? (animate specific properties instead)
- [ ] Animating width/height/top/left instead of transform/opacity?
- [ ] Lists >100 items rendered without pagination/virtualization?

**Backend:**
- [ ] Any N+1 query?
- [ ] Do list endpoints paginate?
- [ ] SELECT * on a large table?

**General:**
- [ ] O(n²) or worse nested loop over meaningfully-sized data?
- [ ] Every subscription/listener has cleanup?

### 🟡 Should check (important)

**Frontend:**
- [ ] Code splitting used for heavy/rarely-used components?
- [ ] Large libraries imported piecemeal?
- [ ] Images served through `next/image`?

**Backend:**
- [ ] Hot data cached where appropriate?
- [ ] WHERE columns indexed?
- [ ] Slow-query monitoring in place?

**API:**
- [ ] Response compression enabled?
- [ ] Only necessary fields returned?

### 🟢 Nice to have

- [ ] Bundle size analyzed?
- [ ] Performance monitoring/APM in place?

---

## Performance Thresholds

### Frontend

| Metric | Good | Needs Improvement | Poor |
|---|---|---|---|
| LCP | ≤ 2.5s | 2.5-4s | > 4s |
| INP | ≤ 200ms | 200-500ms | > 500ms |
| CLS | ≤ 0.1 | 0.1-0.25 | > 0.25 |
| Bundle Size (JS) | < 200KB | 200-500KB | > 500KB |

### Backend

| Metric | Good | Needs Improvement | Poor |
|---|---|---|---|
| API response time | < 100ms | 100-500ms | > 500ms |
| DB query | < 50ms | 50-200ms | > 200ms |

---

## Efficiency Anti-Patterns (Micro Level)

Code-level efficiency mistakes, independent of architecture-level performance issues. Complements the resource-management/concurrency defects already covered in [common-bugs-checklist.md](common-bugs-checklist.md#universal-issues).

### Unnecessary Repeated Work

```typescript
// ❌ Loop-invariant work repeated inside the loop
for (const path of paths) {
  const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
  processFile(path, config);
}

// ✅ Hoisted out of the loop
const config = JSON.parse(fs.readFileSync('config.json', 'utf-8'));
for (const path of paths) processFile(path, config);
```

### Missed Concurrency

```typescript
// ❌ Sequential await for independent operations
const a = await fetchA();
const b = await fetchB();

// ✅ Concurrent
const [a, b] = await Promise.all([fetchA(), fetchB()]);
```

### Unbounded Data Structures

- [ ] Does a global cache/map/list have a `maxSize` or TTL?
- [ ] Do accumulating structures (queues, logs, metrics buffers) have a cap?
- [ ] Are per-request allocated objects retained somewhere that prevents GC?

```typescript
// ❌ Unbounded cache
const cache = new Map<string, unknown>();

// ✅ Bounded LRU-style cache (or use this repo's cache module with a TTL)
const cache = new Map<string, unknown>();
const MAX_SIZE = 256;
function set(key: string, value: unknown) {
  if (cache.size >= MAX_SIZE) cache.delete(cache.keys().next().value);
  cache.set(key, value);
}
```

---

## References

- [Core Web Vitals — web.dev](https://web.dev/articles/vitals)
- [Optimizing Core Web Vitals — Vercel](https://vercel.com/guides/optimizing-core-web-vitals-in-2024)
- [Big O Cheat Sheet](https://www.bigocheatsheet.com/)
- [N+1 Query Problem](https://stackoverflow.com/questions/97197/what-is-the-n1-selects-problem-in-orm-object-relational-mapping)
