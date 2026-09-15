#!/usr/bin/env -S npx tsx
/**
 * PR Analyzer - Analyze PR complexity and suggest a review approach.
 *
 * Scoped to the One Portal monorepo (NestJS backend + Next.js/React frontend,
 * TypeScript throughout).
 *
 * Usage:
 *   npx tsx pr-analyzer.ts [--diff-file FILE] [--stats]
 *
 *   Or pipe diff directly:
 *   git diff main...HEAD | npx tsx pr-analyzer.ts
 */

import { readFileSync } from 'node:fs';

const RISK_NO_TESTS = 'NO_TEST_CHANGES';

interface FileStats {
  filename: string;
  additions: number;
  deletions: number;
  isTest: boolean;
  isConfig: boolean;
  isMigration: boolean;
  language: string;
}

interface PRAnalysis {
  totalFiles: number;
  totalAdditions: number;
  totalDeletions: number;
  files: FileStats[];
  complexityScore: number;
  sizeCategory: string;
  estimatedReviewTime: number;
  riskFactors: string[];
  suggestions: string[];
}

function detectLanguage(filename: string): string {
  const match = /\.[^./]+$/.exec(filename);
  const ext = (match?.[0] ?? '').toLowerCase();
  const extensions: Record<string, string> = {
    '.ts': 'TypeScript',
    '.tsx': 'TypeScript/React',
    '.js': 'JavaScript',
    '.jsx': 'JavaScript/React',
    '.mjs': 'JavaScript',
    '.sql': 'SQL',
    '.md': 'Markdown',
    '.json': 'JSON',
    '.yaml': 'YAML',
    '.yml': 'YAML',
    '.toml': 'TOML',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.html': 'HTML',
  };
  return extensions[ext] ?? 'unknown';
}

export function isTestFile(filename: string): boolean {
  const testPatterns = [
    /\.spec\.ts$/, // backend unit specs
    /\.e2e-spec\.ts$/, // backend e2e specs
    /\.test\.(ts|tsx|js|jsx)$/,
    /\.spec\.(tsx|js|jsx)$/,
    /(^|\/)tests?\//,
    /(^|\/)__tests__\//,
    /(^|\/)e2e\//,
  ];
  return testPatterns.some((p) => p.test(filename));
}

function isConfigFile(filename: string): boolean {
  const configPatterns = [
    /\.env/,
    /config\./,
    /\.json$/,
    /\.yaml$/,
    /\.yml$/,
    /\.toml$/,
    /package\.json$/,
    /tsconfig.*\.json$/,
    /turbo\.json$/,
  ];
  return configPatterns.some((p) => p.test(filename));
}

export function isMigrationFile(filename: string): boolean {
  return filename.includes('infra/database/migrations') || filename.includes('infra/database/sqlite-migrations');
}

export function parseDiff(diffContent: string): FileStats[] {
  const files: FileStats[] = [];
  let current: FileStats | null = null;

  for (const line of diffContent.split('\n')) {
    if (line.startsWith('diff --git')) {
      if (current) files.push(current);
      // "diff --git a/<path> b/<path>" — match the b/ side via a
      // backreference so a literal "b/" inside paths like lib/, web/ or
      // db/ can't be mistaken for the prefix. Renames have differing
      // paths, so fall back to the b/ side after the separating space.
      const exactMatch = /^diff --git a\/(.+?) b\/\1$/.exec(line);
      const filename = exactMatch?.[1] ?? / b\/(.+)$/.exec(line)?.[1];

      current = filename
        ? {
            filename,
            additions: 0,
            deletions: 0,
            isTest: isTestFile(filename),
            isConfig: isConfigFile(filename),
            isMigration: isMigrationFile(filename),
            language: detectLanguage(filename),
          }
        : null;
    } else if (current) {
      if (line.startsWith('+') && !line.startsWith('+++')) current.additions++;
      else if (line.startsWith('-') && !line.startsWith('---')) current.deletions++;
    }
  }

  if (current) files.push(current);
  return files;
}

function calculateComplexity(files: FileStats[]): number {
  if (!files.length) return 0;

  const totalChanges = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  const sizeFactor = Math.min(totalChanges / 1000, 1);
  const fileFactor = Math.min(files.length / 20, 1);

  const testLines = files.filter((f) => f.isTest).reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const nonTestRatio = 1 - testLines / Math.max(totalChanges, 1);

  // Backend + frontend touched in the same PR is riskier.
  const touchesBackend = files.some((f) => f.filename.includes('apps/backend'));
  const touchesFrontend = files.some((f) => f.filename.includes('apps/frontend'));
  const crossAppFactor = touchesBackend && touchesFrontend ? 1 : 0;

  const complexity = sizeFactor * 0.4 + fileFactor * 0.2 + nonTestRatio * 0.2 + crossAppFactor * 0.2;
  return Math.round(complexity * 100) / 100;
}

function categorizeSize(totalChanges: number): string {
  if (totalChanges < 50) return 'XS (Extra Small)';
  if (totalChanges < 200) return 'S (Small)';
  if (totalChanges < 400) return 'M (Medium)';
  if (totalChanges < 800) return 'L (Large)';
  return 'XL (Extra Large) - Consider splitting';
}

function estimateReviewTime(files: FileStats[], complexity: number): number {
  const totalChanges = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const baseTime = totalChanges / 20;
  const adjustedTime = baseTime * (1 + complexity);
  return Math.max(5, Math.min(120, Math.floor(adjustedTime)));
}

function identifyRiskFactors(files: FileStats[]): string[] {
  const risks: string[] = [];

  const totalChanges = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
  const testChanges = files.filter((f) => f.isTest).reduce((sum, f) => sum + f.additions + f.deletions, 0);

  if (totalChanges > 400) {
    risks.push('Large PR (>400 lines) - harder to review thoroughly');
  }

  if (testChanges === 0 && totalChanges > 50) {
    risks.push(`${RISK_NO_TESTS}: No test changes - verify test coverage`);
  }

  if (totalChanges > 100 && testChanges / Math.max(totalChanges, 1) < 0.2) {
    risks.push('Low test ratio (<20%) - consider adding more tests');
  }

  const securityPatterns = ['.env', 'auth', 'security', 'password', 'token', 'secret', 'guard'];
  if (files.some((f) => securityPatterns.some((p) => f.filename.toLowerCase().includes(p)))) {
    const hit = files.find((f) => securityPatterns.some((p) => f.filename.toLowerCase().includes(p)));
    risks.push(`Security-sensitive file: ${hit!.filename}`);
  }

  const migrationFiles = files.filter((f) => f.isMigration);
  if (migrationFiles.length) {
    risks.push(
      `Database migration(s) touched (${migrationFiles.length} file(s)) - verify it was generated ` +
        'per apps/backend/CLAUDE.md, not hand-written, and is registered in test/setup-e2e.ts',
    );
  }

  if (files.some((f) => f.language === 'SQL' && !f.isMigration)) {
    risks.push('Raw SQL changes detected outside migrations - review carefully');
  }

  const touchesBackend = files.some((f) => f.filename.includes('apps/backend'));
  const touchesFrontend = files.some((f) => f.filename.includes('apps/frontend'));
  if (touchesBackend && touchesFrontend) {
    risks.push('PR spans both apps/backend and apps/frontend - CI is scoped by paths, verify both pipelines ran');
  }

  const configFiles = files.filter((f) => f.isConfig);
  if (configFiles.length) {
    risks.push(`Configuration changes in ${configFiles.length} file(s)`);
  }

  return risks;
}

function generateSuggestions(files: FileStats[], complexity: number, risks: string[]): string[] {
  const suggestions: string[] = [];

  const totalChanges = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

  if (totalChanges > 800) {
    suggestions.push('Consider splitting this PR into smaller, focused changes');
  }

  if (complexity > 0.7) {
    suggestions.push('High complexity - allocate extra review time');
    suggestions.push('Consider pair reviewing for critical sections');
  }

  if (risks.some((r) => r.includes(RISK_NO_TESTS))) {
    suggestions.push('Request test additions before approval');
  }

  const languages = new Set(files.map((f) => f.language));
  if (languages.has('TypeScript') || languages.has('TypeScript/React')) {
    suggestions.push('Check for `any` usage and unhandled Either error branches');
  }
  if (files.some((f) => f.filename.includes('apps/backend'))) {
    suggestions.push('Check Either pattern, UnitOfWork usage, and pg-boss event publishing (see reference/nestjs-typescript.md)');
  }
  if (files.some((f) => f.filename.includes('apps/frontend'))) {
    suggestions.push('Check Server/Client component boundary and design-system token usage (see reference/react-nextjs.md)');
  }
  if (files.some((f) => f.isMigration)) {
    suggestions.push('Verify migration was generated via the documented sequence, not hand-written');
  }
  if (languages.has('SQL')) {
    suggestions.push('Review for SQL injection and query performance (N+1, missing indexes)');
  }

  if (!suggestions.length) {
    suggestions.push('Standard review process should suffice');
  }

  return suggestions;
}

export function analyzePr(diffContent: string): PRAnalysis {
  const files = parseDiff(diffContent);

  const totalAdditions = files.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = files.reduce((sum, f) => sum + f.deletions, 0);
  const totalChanges = totalAdditions + totalDeletions;

  const complexity = calculateComplexity(files);
  const risks = identifyRiskFactors(files);
  const suggestions = generateSuggestions(files, complexity, risks);

  return {
    totalFiles: files.length,
    totalAdditions,
    totalDeletions,
    files,
    complexityScore: complexity,
    sizeCategory: categorizeSize(totalChanges),
    estimatedReviewTime: estimateReviewTime(files, complexity),
    riskFactors: risks,
    suggestions,
  };
}

function printAnalysis(analysis: PRAnalysis, showFiles: boolean): void {
  console.log('\n' + '='.repeat(60));
  console.log('PR ANALYSIS REPORT');
  console.log('='.repeat(60));

  console.log('\n📊 SUMMARY');
  console.log(`   Files changed: ${analysis.totalFiles}`);
  console.log(`   Additions: +${analysis.totalAdditions}`);
  console.log(`   Deletions: -${analysis.totalDeletions}`);
  console.log(`   Total changes: ${analysis.totalAdditions + analysis.totalDeletions}`);

  console.log(`\n📏 SIZE: ${analysis.sizeCategory}`);
  console.log(`   Complexity score: ${analysis.complexityScore}/1.0`);
  console.log(`   Estimated review time: ~${analysis.estimatedReviewTime} minutes`);

  if (analysis.riskFactors.length) {
    console.log('\n⚠️  RISK FACTORS:');
    for (const risk of analysis.riskFactors) console.log(`   • ${risk}`);
  }

  console.log('\n💡 SUGGESTIONS:');
  for (const suggestion of analysis.suggestions) console.log(`   • ${suggestion}`);

  if (showFiles) {
    console.log('\n📁 FILES:');
    const byLang = new Map<string, FileStats[]>();
    for (const f of analysis.files) {
      const bucket = byLang.get(f.language) ?? [];
      bucket.push(f);
      byLang.set(f.language, bucket);
    }

    for (const lang of [...byLang.keys()].sort()) {
      console.log(`\n   [${lang}]`);
      for (const f of byLang.get(lang)!) {
        const prefix = f.isTest ? '🧪' : f.isMigration ? '🗄️' : f.isConfig ? '⚙️' : '📄';
        console.log(`   ${prefix} ${f.filename} (+${f.additions}/-${f.deletions})`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
}

function main(): void {
  const args = process.argv.slice(2);
  const diffFileIdx = args.findIndex((a) => a === '--diff-file' || a === '-f');
  const diffFile = diffFileIdx >= 0 ? args[diffFileIdx + 1] : undefined;
  const showStats = args.includes('--stats') || args.includes('-s');

  let diffContent: string;
  try {
    if (diffFile) {
      diffContent = readFileSync(diffFile, 'utf-8');
    } else if (!process.stdin.isTTY) {
      diffContent = readFileSync(0, 'utf-8');
    } else {
      console.log('Usage: git diff main...HEAD | npx tsx pr-analyzer.ts');
      console.log('       npx tsx pr-analyzer.ts -f diff.txt');
      process.exit(1);
    }
  } catch (e) {
    console.error(`Error reading diff input: ${(e as Error).message}`);
    process.exit(1);
  }

  if (!diffContent!.trim()) {
    console.log('No diff content provided');
    process.exit(1);
  }

  const analysis = analyzePr(diffContent!);
  printAnalysis(analysis, showStats);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
