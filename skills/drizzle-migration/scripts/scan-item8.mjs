#!/usr/bin/env node
/**
 * Inventário do item 8 (remoção do TypeORM) — o que ainda falta converter nos specs.
 *
 * Existe pelo mesmo motivo do `scan-progress.mjs`: o item 8 atravessa sessões e ninguém deve
 * digitar à mão "faltam N arquivos". Rode e cole a saída no `PROGRESS.md`.
 *
 *   node .claude/skills/drizzle-migration/scripts/scan-item8.mjs
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'apps', 'backend', 'src');

const files = globSync('**/*.ts', { cwd: SRC }).filter((f) =>
  readFileSync(join(SRC, f), 'utf8').includes('getRepository'),
);

const methods = new Map();
let inlineTotal = 0;
let boundTotal = 0;
const perFile = [];

for (const file of files) {
  const text = readFileSync(join(SRC, file), 'utf8');

  // `dataSource.getRepository(X).metodo(` — sem variável intermediária
  const inline = [...text.matchAll(/getRepository\(\s*\w+\s*,?\s*\)\s*\.\s*(\w+)\(/gs)].map(
    (m) => m[1],
  );

  // `x = dataSource.getRepository(X)` e depois `x.metodo(`
  const bound = [];
  for (const [, variable] of text.matchAll(/(\w+)\s*=\s*dataSource\.getRepository\(\s*\w+/gs)) {
    bound.push(
      ...[...text.matchAll(new RegExp(`\\b${variable}\\.(\\w+)\\(`, 'g'))].map((m) => m[1]),
    );
  }

  inlineTotal += inline.length;
  boundTotal += bound.length;
  for (const m of [...inline, ...bound]) methods.set(m, (methods.get(m) ?? 0) + 1);
  perFile.push([file, inline.length + bound.length]);
}

console.log(`arquivos com getRepository: ${files.length}`);
console.log(`call sites: ${boundTotal + inlineTotal} (${boundTotal} por variável, ${inlineTotal} inline)\n`);

console.log('métodos do TypeORM ainda em uso:');
for (const [name, n] of [...methods].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)}  .${name}()`);
}

console.log('\nmaiores arquivos:');
for (const [file, n] of perFile.sort((a, b) => b[1] - a[1]).slice(0, 12)) {
  console.log(`  ${String(n).padStart(3)}  ${file}`);
}
