import { describe, expect, it } from 'vitest';
import { isMigrationFile, isTestFile, parseDiff } from './pr-analyzer';

describe('parseDiff', () => {
  it('handles a "lib/" path that embeds a literal "b/"', () => {
    const diff = [
      'diff --git a/lib/foo.ts b/lib/foo.ts',
      'index 1234567..89abcde 100644',
      '--- a/lib/foo.ts',
      '+++ b/lib/foo.ts',
      '@@ -1,2 +1,3 @@',
      ' unchanged',
      '+added line',
      '-removed line',
      '',
    ].join('\n');

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('lib/foo.ts');
    expect(files[0].additions).toBe(1);
    expect(files[0].deletions).toBe(1);
  });

  it('parses a normal path', () => {
    const diff = [
      'diff --git a/apps/backend/src/main.ts b/apps/backend/src/main.ts',
      'index 1111111..2222222 100644',
      '--- a/apps/backend/src/main.ts',
      '+++ b/apps/backend/src/main.ts',
      '@@ -0,0 +1 @@',
      "+console.log('hi')",
      '',
    ].join('\n');

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('apps/backend/src/main.ts');
  });

  it('handles other prefixes that embed a literal "b/" (web/, db/)', () => {
    const diff = [
      'diff --git a/web/x.js b/web/x.js',
      '+++ b/web/x.js',
      '+console.log(1)',
      'diff --git a/db/y.sql b/db/y.sql',
      '+++ b/db/y.sql',
      '+SELECT 1;',
      '',
    ].join('\n');

    const files = parseDiff(diff);
    expect(files.map((f) => f.filename)).toEqual(['web/x.js', 'db/y.sql']);
  });

  it('falls back to the b/ side for renames', () => {
    const diff = [
      'diff --git a/old/name.ts b/new/name.ts',
      'similarity index 100%',
      'rename from old/name.ts',
      'rename to new/name.ts',
      '',
    ].join('\n');

    const files = parseDiff(diff);
    expect(files).toHaveLength(1);
    expect(files[0].filename).toBe('new/name.ts');
  });
});

describe('isMigrationFile', () => {
  it('detects Postgres/TypeORM and SQLite/Kysely migrations', () => {
    expect(isMigrationFile('infra/database/migrations/1234-AddColumn.ts')).toBe(true);
    expect(isMigrationFile('infra/database/sqlite-migrations/0001-init.ts')).toBe(true);
    expect(isMigrationFile('apps/backend/src/modules/user/user.module.ts')).toBe(false);
  });
});

describe('isTestFile', () => {
  it('detects backend unit and e2e specs', () => {
    expect(isTestFile('apps/backend/src/modules/user/contexts/create/tests/create.service.spec.ts')).toBe(true);
    expect(isTestFile('apps/backend/src/modules/user/contexts/create/tests/create.e2e-spec.ts')).toBe(true);
    expect(isTestFile('apps/backend/src/modules/user/user.service.ts')).toBe(false);
  });

  it('detects frontend Playwright and Vitest specs', () => {
    expect(isTestFile('apps/frontend/e2e/managed-client.spec.ts')).toBe(true);
    expect(isTestFile('apps/frontend/src/components/Button.test.tsx')).toBe(true);
  });
});
