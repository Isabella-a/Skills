#!/usr/bin/env node
/**
 * Scanner de progresso da migração TypeORM → Drizzle.
 *
 * Deriva o estado REAL da migração a partir do código-fonte — nunca de prosa escrita
 * à mão. O sinal primário é simples e difícil de falsear: um arquivo foi migrado
 * quando deixa de importar `typeorm`.
 *
 * Uso:
 *   node .claude/skills/drizzle-migration/scripts/scan-progress.mjs           # markdown
 *   node .claude/skills/drizzle-migration/scripts/scan-progress.mjs --json    # json
 *   node .claude/skills/drizzle-migration/scripts/scan-progress.mjs --pending # só o que falta
 *
 * Sem dependências: roda com o Node do projeto em qualquer shell (PowerShell, Git Bash, CI).
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const args = new Set(process.argv.slice(2));
const AS_JSON = args.has('--json');
const ONLY_PENDING = args.has('--pending');

// ---------------------------------------------------------------------------
// Raiz do repositório
// ---------------------------------------------------------------------------

function findRepoRoot() {
  try {
    return execFileSync('git', ['rev-parse', '--show-toplevel'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    // Fallback: .claude/skills/<skill>/scripts/ → 4 níveis acima
    return path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../../..');
  }
}

const ROOT = findRepoRoot();
const BACKEND = path.join(ROOT, 'apps', 'backend');
const DB_DIR = path.join(BACKEND, 'src', 'shared', 'modules', 'database');

const P = {
  repositories: path.join(DB_DIR, 'repositories'),
  entities: path.join(DB_DIR, 'entities'),
  views: path.join(DB_DIR, 'views'),
  drizzleSchema: path.join(DB_DIR, 'drizzle', 'schema'),
  unitOfWork: path.join(DB_DIR, 'unit-of-work.ts'),
  databaseModule: path.join(DB_DIR, 'database.module.ts'),
  baseRepository: path.join(DB_DIR, 'repositories', 'base.repository.ts'),
  modules: path.join(BACKEND, 'src', 'modules'),
  shared: path.join(BACKEND, 'src', 'shared'),
  setupE2e: path.join(BACKEND, 'test', 'setup-e2e.ts'),
  typeormMigrations: path.join(BACKEND, 'infra', 'database', 'migrations'),
  packageJson: path.join(BACKEND, 'package.json'),
  reportDir: path.join(BACKEND, 'docs', 'drizzle-migration'),
};

// Repos que NÃO fazem parte do escopo da migração (não usam TypeORM hoje).
// one-finder-*: pg.Pool + SQL cru contra o Postgres externo do One Finder.
// parquet: DuckDB. index/base: infraestrutura, contabilizados à parte.
const OUT_OF_SCOPE = new Set([
  'one-finder-read.repository.ts',
  'one-finder-write.repository.ts',
  'one-finder-sync.repository.ts',
  'parquet.repository.ts',
]);
const INFRA_FILES = new Set(['index.ts', 'base.repository.ts']);

const TYPEORM_IMPORT = /from\s+['"]typeorm(?:\/[^'"]*)?['"]/;
const DRIZZLE_IMPORT = /from\s+['"]drizzle-orm(?:\/[^'"]*)?['"]/;
// Um repository simples pode não importar `drizzle-orm` direto (só a tabela do schema
// e a base). Estes dois marcadores juntos evitam classificar um esboço vazio como pronto.
const SCHEMA_IMPORT = /from\s+['"][^'"]*drizzle\/schema[^'"]*['"]/;
const DRIZZLE_BASE = /Drizzle\w*(?:Base)?Repository|DrizzleDatabase|SoftDeleteBaseRepository/;

// ---------------------------------------------------------------------------
// Helpers de arquivo
// ---------------------------------------------------------------------------

const read = (f) => {
  try {
    return fs.readFileSync(f, 'utf8');
  } catch {
    return null;
  }
};

const exists = (f) => fs.existsSync(f);

function walk(dir, filter = (f) => f.endsWith('.ts')) {
  if (!exists(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      out.push(...walk(full, filter));
    } else if (filter(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f) => path.relative(ROOT, f).split(path.sep).join('/');
const isTest = (f) => /\.(spec|e2e-spec)\.ts$/.test(f);
const countMatches = (text, re) => (text?.match(re) ?? []).length;

// ---------------------------------------------------------------------------
// 1. Repositories — o coração da migração
// ---------------------------------------------------------------------------

function scanRepositories() {
  const files = walk(P.repositories).filter((f) => !isTest(path.basename(f)));
  const migrated = [];
  const pending = [];
  const partial = [];
  const outOfScope = [];
  const infra = [];

  for (const file of files) {
    const name = path.basename(file);
    const text = read(file) ?? '';
    const hasTypeorm = TYPEORM_IMPORT.test(text);
    const hasDrizzle = DRIZZLE_IMPORT.test(text) || SCHEMA_IMPORT.test(text) || DRIZZLE_BASE.test(text);
    const lines = text.split('\n').length;
    const entry = { file: rel(file), name, lines, hasTypeorm, hasDrizzle };

    if (OUT_OF_SCOPE.has(name)) outOfScope.push(entry);
    else if (INFRA_FILES.has(name)) infra.push(entry);
    else if (hasTypeorm && hasDrizzle) partial.push({ ...entry, reason: 'importa os dois ORMs' });
    else if (hasTypeorm) pending.push(entry);
    else if (hasDrizzle) migrated.push(entry);
    // Sem nenhum dos dois marcadores: não dá para afirmar que está pronto.
    else partial.push({ ...entry, reason: 'sem marcador de Drizzle — esboço ou incompleto?' });
  }

  // Maiores pendentes primeiro: é onde mora o risco e o esforço.
  pending.sort((a, b) => b.lines - a.lines);
  partial.sort((a, b) => b.lines - a.lines);
  migrated.sort((a, b) => a.name.localeCompare(b.name));

  return { migrated, pending, partial, outOfScope, infra };
}

// ---------------------------------------------------------------------------
// 2. Schema Drizzle vs entities TypeORM
// ---------------------------------------------------------------------------

function scanSchema() {
  const schemaFiles = walk(P.drizzleSchema);
  let pgTable = 0;
  let pgEnum = 0;
  let pgView = 0;
  let relations = 0;
  for (const f of schemaFiles) {
    const t = read(f) ?? '';
    pgTable += countMatches(t, /\bpgTable\s*\(/g);
    pgEnum += countMatches(t, /\bpgEnum\s*\(/g);
    pgView += countMatches(t, /\bpgView\s*\(/g);
    relations += countMatches(t, /\brelations\s*\(/g);
  }

  const entityFiles = walk(P.entities).filter((f) => path.basename(f) !== 'index.ts');
  const viewFiles = walk(P.views).filter((f) => path.basename(f) !== 'index.ts');

  return {
    schemaFiles: schemaFiles.length,
    pgTable,
    pgEnum,
    pgView,
    relations,
    entitiesRemaining: entityFiles.length,
    viewsRemaining: viewFiles.length,
  };
}

// ---------------------------------------------------------------------------
// 3. Vazamento de TypeORM fora da camada database
// ---------------------------------------------------------------------------

function scanLeakage() {
  const dbDirNormalized = DB_DIR + path.sep;
  const candidates = [...walk(P.modules), ...walk(P.shared)].filter(
    (f) => !f.startsWith(dbDirNormalized),
  );

  const production = [];
  const tests = [];

  for (const file of candidates) {
    const text = read(file) ?? '';
    if (!TYPEORM_IMPORT.test(text)) continue;
    // Símbolos importados de typeorm — ajuda a dimensionar o trabalho restante.
    const symbols = [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]typeorm['"]/g)]
      .flatMap((m) => m[1].split(','))
      .map((s) => s.trim().split(/\s+as\s+/)[0])
      .filter(Boolean);
    const entry = { file: rel(file), symbols: [...new Set(symbols)] };
    if (isTest(path.basename(file))) tests.push(entry);
    else production.push(entry);
  }

  // E2E que dependem de entities/DataSource para seed (migram só no fim).
  const e2eFiles = [...walk(P.modules), ...walk(P.shared)].filter((f) =>
    f.endsWith('.e2e-spec.ts'),
  );

  const symbolTally = {};
  for (const { symbols } of production) {
    for (const s of symbols) symbolTally[s] = (symbolTally[s] ?? 0) + 1;
  }

  return {
    production,
    tests,
    e2eTotal: e2eFiles.length,
    symbolTally: Object.entries(symbolTally).sort((a, b) => b[1] - a[1]),
  };
}

// ---------------------------------------------------------------------------
// 4. Infraestrutura: UoW, DatabaseModule, setup-e2e, migrations, deps
// ---------------------------------------------------------------------------

function scanInfra() {
  const uow = read(P.unitOfWork);
  const dbModule = read(P.databaseModule);
  const base = read(P.baseRepository);
  const setup = read(P.setupE2e);
  const pkgRaw = read(P.packageJson);
  const pkg = pkgRaw ? JSON.parse(pkgRaw) : { dependencies: {}, devDependencies: {} };
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Migrations Drizzle: descobre a pasta pelo drizzle.config.ts, com fallback.
  const cfg =
    read(path.join(BACKEND, 'drizzle.config.ts')) ??
    read(path.join(BACKEND, 'infra', 'database', 'drizzle.config.ts'));
  let drizzleMigrationsDir = null;
  if (cfg) {
    const m = cfg.match(/out\s*:\s*['"]([^'"]+)['"]/);
    if (m) drizzleMigrationsDir = path.resolve(BACKEND, m[1]);
  }
  if (!drizzleMigrationsDir) {
    for (const guess of [
      path.join(BACKEND, 'infra', 'database', 'drizzle'),
      path.join(BACKEND, 'drizzle'),
    ]) {
      if (exists(guess)) drizzleMigrationsDir = guess;
    }
  }

  const drizzleMigrations = drizzleMigrationsDir
    ? walk(drizzleMigrationsDir, (f) => f.endsWith('.sql')).length
    : 0;

  return {
    unitOfWork: {
      exists: uow !== null,
      stillTypeorm: uow ? TYPEORM_IMPORT.test(uow) : false,
      hasDrizzle: uow ? DRIZZLE_IMPORT.test(uow) : false,
      hasSetContextPattern: uow ? /getContext\s*\(/.test(uow) : false,
    },
    baseRepository: {
      exists: base !== null,
      stillTypeorm: base ? TYPEORM_IMPORT.test(base) : false,
      hasDrizzle: base ? DRIZZLE_IMPORT.test(base) : false,
    },
    databaseModule: {
      hasTypeOrmModule: dbModule ? /TypeOrmModule/.test(dbModule) : false,
      hasDrizzleProvider: dbModule ? /drizzle/i.test(dbModule) : false,
      providerBindings: dbModule ? countMatches(dbModule, /useClass\s*:/g) : 0,
    },
    setupE2e: {
      stillTypeorm: setup ? TYPEORM_IMPORT.test(setup) : false,
      lines: setup ? setup.split('\n').length : 0,
      manualMigrationImports: setup
        ? countMatches(setup, /^import\s*\{\s*[A-Za-z0-9_]+\d{10,}/gm)
        : 0,
      usesDrizzleMigrator: setup ? /drizzle-orm\/.*migrator|\bmigrate\s*\(/.test(setup) : false,
    },
    migrations: {
      typeorm: walk(P.typeormMigrations).length,
      drizzle: drizzleMigrations,
      drizzleDir: drizzleMigrationsDir ? rel(drizzleMigrationsDir) : null,
    },
    deps: {
      typeorm: deps.typeorm ?? null,
      nestTypeorm: deps['@nestjs/typeorm'] ?? null,
      drizzleOrm: deps['drizzle-orm'] ?? null,
      drizzleKit: deps['drizzle-kit'] ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// 5. Sincronização com develop (branch longa acumula débito de merge)
// ---------------------------------------------------------------------------

function scanGitSync() {
  const git = (a) => {
    try {
      return execFileSync('git', a, {
        cwd: ROOT,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      return null;
    }
  };

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const baseRef = ['origin/develop', 'develop'].find((r) => git(['rev-parse', '--verify', r]));
  if (!baseRef) return { branch, baseRef: null };

  const behind = git(['rev-list', '--count', `HEAD..${baseRef}`]);
  const ahead = git(['rev-list', '--count', `${baseRef}..HEAD`]);
  // Commits em develop, ainda não integrados, que tocaram a camada de banco:
  // são os que podem ter adicionado código TypeORM novo para portar.
  const dbCommits = git([
    'log',
    '--oneline',
    `HEAD..${baseRef}`,
    '--',
    'apps/backend/src/shared/modules/database',
    'apps/backend/infra/database/migrations',
  ]);

  return {
    branch,
    baseRef,
    behind: behind ? Number(behind) : null,
    ahead: ahead ? Number(ahead) : null,
    dbTouchingCommits: dbCommits ? dbCommits.split('\n').filter(Boolean) : [],
    dirty: (git(['status', '--porcelain']) ?? '').split('\n').filter(Boolean).length,
  };
}

// ---------------------------------------------------------------------------
// Baseline: congela o inventário inicial para o denominador do progresso
// ---------------------------------------------------------------------------

function loadOrCreateBaseline(repos) {
  const file = path.join(P.reportDir, 'baseline.json');
  const existing = read(file);
  if (existing) {
    try {
      return { baseline: JSON.parse(existing), created: false, file: rel(file) };
    } catch {
      /* baseline corrompido — recria abaixo */
    }
  }

  const inScope = [...repos.pending, ...repos.partial, ...repos.migrated];
  const baseline = {
    createdAt: new Date().toISOString().slice(0, 10),
    note:
      'Inventário congelado no início da migração. Denominador do progresso — ' +
      'não editar à mão conforme arquivos são migrados.',
    repositoriesInScope: inScope.length,
    repositories: inScope
      .map((r) => ({ name: r.name, lines: r.lines }))
      .sort((a, b) => b.lines - a.lines),
  };

  fs.mkdirSync(P.reportDir, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(baseline, null, 2) + '\n', 'utf8');
  return { baseline, created: true, file: rel(file) };
}

// ---------------------------------------------------------------------------
// Montagem do resultado
// ---------------------------------------------------------------------------

const repos = scanRepositories();
const schema = scanSchema();
const leakage = scanLeakage();
const infra = scanInfra();
const gitSync = scanGitSync();
const { baseline, created: baselineCreated, file: baselineFile } = loadOrCreateBaseline(repos);

// Denominador = o maior entre o baseline congelado e o total em escopo hoje. Merges de
// `develop` podem trazer repositories novos ao longo da branch; sem o `max`, o progresso
// passaria de 100%.
const currentInScope = repos.pending.length + repos.partial.length + repos.migrated.length;
const inScopeTotal = Math.max(baseline.repositoriesInScope ?? 0, currentInScope);
const newSinceBaseline = Math.max(0, currentInScope - (baseline.repositoriesInScope ?? 0));
const migratedCount = repos.migrated.length;
const pct = inScopeTotal ? Math.round((migratedCount / inScopeTotal) * 100) : 0;

// Parciais contam como pendentes no volume — trabalho meio-feito não é progresso.
const linesPending = [...repos.pending, ...repos.partial].reduce((a, r) => a + r.lines, 0);
const linesBaseline = (baseline.repositories ?? []).reduce((a, r) => a + r.lines, 0);
const pctLines = linesBaseline
  ? Math.round(((linesBaseline - linesPending) / linesBaseline) * 100)
  : 0;

const result = {
  scannedAt: new Date().toISOString(),
  progress: {
    repositoriesMigrated: migratedCount,
    repositoriesInScope: inScopeTotal,
    percentByFile: pct,
    percentByLines: pctLines,
    linesPending,
  },
  repositories: repos,
  schema,
  leakage,
  infra,
  gitSync,
  baseline: { file: baselineFile, created: baselineCreated },
};

if (AS_JSON) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Saída markdown (colável no PROGRESS.md)
// ---------------------------------------------------------------------------

const out = [];
const bar = (p) => '█'.repeat(Math.round(p / 5)).padEnd(20, '░');
const flag = (bad, okMsg, badMsg) => (bad ? `⚠️  ${badMsg}` : `✅ ${okMsg}`);

if (ONLY_PENDING) {
  if (repos.partial.length) {
    out.push('## ⚠️ Meio-migrados (resolver primeiro)\n');
    for (const r of repos.partial) {
      out.push(`- [ ] ${r.name} (${r.lines} linhas) — ${r.reason} — ${r.file}`);
    }
    out.push('');
  }
  out.push('## Repositories pendentes (maiores primeiro)\n');
  if (!repos.pending.length) out.push('_Nenhum pendente intocado._');
  for (const r of repos.pending) out.push(`- [ ] ${r.name} (${r.lines} linhas) — ${r.file}`);
  console.log(out.join('\n'));
  process.exit(0);
}

out.push('<!-- GERADO POR scan-progress.mjs — NÃO EDITAR À MÃO -->');
out.push(`_Scan em ${result.scannedAt.slice(0, 16).replace('T', ' ')} UTC_\n`);

out.push('## Progresso\n');
out.push('```');
out.push(`Repositories  ${bar(pct)} ${pct}%  (${migratedCount}/${inScopeTotal} arquivos)`);
out.push(`Por volume    ${bar(pctLines)} ${pctLines}%  (${linesPending} linhas pendentes)`);
out.push('```\n');

if (newSinceBaseline > 0) {
  out.push(
    `> ⚠️  **${newSinceBaseline} repository(ies) novo(s) desde o baseline** — chegaram por merge de ` +
      '`develop` e também precisam ser migrados. Escopo cresceu.\n',
  );
}

out.push('| Frente | Estado |');
out.push('|---|---|');
out.push(
  `| Schema Drizzle | ${schema.pgTable} tabelas, ${schema.pgEnum} enums, ${schema.pgView} views, ${schema.relations} blocos de relations |`,
);
out.push(
  `| Entities TypeORM restantes | ${schema.entitiesRemaining} entities + ${schema.viewsRemaining} views |`,
);
out.push(
  `| BaseRepository | ${flag(infra.baseRepository.stillTypeorm, 'portado para Drizzle', 'ainda em TypeORM')} |`,
);
out.push(
  `| UnitOfWork | ${flag(infra.unitOfWork.stillTypeorm, 'portado para Drizzle', 'ainda em TypeORM')} |`,
);
out.push(
  `| DatabaseModule | TypeOrmModule: ${infra.databaseModule.hasTypeOrmModule ? 'presente' : 'removido'} · provider Drizzle: ${infra.databaseModule.hasDrizzleProvider ? 'presente' : 'ausente'} · ${infra.databaseModule.providerBindings} bindings |`,
);
out.push(
  `| setup-e2e.ts | ${infra.setupE2e.lines} linhas, ${infra.setupE2e.manualMigrationImports} imports manuais de migration · migrator Drizzle: ${infra.setupE2e.usesDrizzleMigrator ? 'sim' : 'não'} |`,
);
out.push(
  `| Migrations | ${infra.migrations.typeorm} TypeORM (congeladas) · ${infra.migrations.drizzle} Drizzle${infra.migrations.drizzleDir ? ` em \`${infra.migrations.drizzleDir}\`` : ''} |`,
);
out.push(
  `| Dependências | typeorm: ${infra.deps.typeorm ?? '—'} · drizzle-orm: ${infra.deps.drizzleOrm ?? '—'} · drizzle-kit: ${infra.deps.drizzleKit ?? '—'} |`,
);
out.push(
  `| Vazamento em produção | ${leakage.production.length} arquivos fora da camada database ainda importam typeorm |`,
);
out.push(
  `| Testes | ${leakage.tests.length} arquivos de teste importam typeorm (de ${leakage.e2eTotal} e2e) |`,
);
out.push('');

if (repos.partial.length) {
  out.push(`## ⚠️ Meio-migrados — ${repos.partial.length} (resolver antes de seguir)\n`);
  out.push('Trabalho em aberto: nenhum destes conta como progresso.\n');
  for (const r of repos.partial) {
    out.push(`- [ ] \`${r.name}\` (${r.lines} linhas) — ${r.reason}`);
  }
  out.push('');
}

if (repos.pending.length) {
  out.push(`## Repositories pendentes — ${repos.pending.length} (maiores primeiro)\n`);
  const top = repos.pending.slice(0, 15);
  for (const r of top) out.push(`- [ ] \`${r.name}\` — ${r.lines} linhas`);
  if (repos.pending.length > top.length) {
    out.push(`- _…e mais ${repos.pending.length - top.length}. Use \`--pending\` para a lista completa._`);
  }
  out.push('');
}

if (repos.migrated.length) {
  out.push(`## Repositories migrados — ${repos.migrated.length}\n`);
  out.push(repos.migrated.map((r) => `\`${r.name}\``).join(', '));
  out.push('');
}

if (leakage.symbolTally.length) {
  out.push('## Símbolos TypeORM ainda usados em código de produção\n');
  out.push(leakage.symbolTally.map(([s, n]) => `\`${s}\` (${n})`).join(', '));
  out.push('');
}

out.push('## Sincronização com develop\n');
if (!gitSync.baseRef) {
  out.push('_Não foi possível resolver `origin/develop` — rode `git fetch` para checar o débito._');
} else {
  out.push(`- Branch atual: \`${gitSync.branch}\` (base: \`${gitSync.baseRef}\`)`);
  out.push(`- ${gitSync.behind} commits atrás · ${gitSync.ahead} commits à frente`);
  out.push(`- Working tree: ${gitSync.dirty === 0 ? 'limpo' : `${gitSync.dirty} arquivos alterados`}`);
  if (gitSync.dbTouchingCommits.length) {
    out.push(
      `- ⚠️  **${gitSync.dbTouchingCommits.length} commits não integrados tocaram a camada de banco** — podem ter adicionado código TypeORM novo para portar:`,
    );
    for (const c of gitSync.dbTouchingCommits.slice(0, 10)) out.push(`  - ${c}`);
    if (gitSync.dbTouchingCommits.length > 10) {
      out.push(`  - _…e mais ${gitSync.dbTouchingCommits.length - 10}_`);
    }
  } else {
    out.push('- ✅ Nenhum commit não integrado tocou a camada de banco');
  }
}
out.push('');

if (baselineCreated) {
  out.push(
    `> **Baseline criado agora** em \`${baselineFile}\` com ${inScopeTotal} repositories em escopo. ` +
      'Commite esse arquivo — ele é o denominador do progresso e não deve ser editado à mão.',
  );
}

console.log(out.join('\n'));
