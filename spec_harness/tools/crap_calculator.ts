#!/usr/bin/env -S node
/**
 * Calcula CRAP para TypeScript/JavaScript a partir de um relatório de cobertura no formato
 * Istanbul (`coverage-final.json`, o que jest/vitest/nyc emitem com o reporter `json`) e da
 * complexidade ciclomática medida via `eslintcc` (a regra `complexity` do próprio ESLint —
 * McCabe, o mesmo que o `radon` mede em Python).
 *
 * Porta de tools/crap_calculator.py: mesma fórmula, mesmos flags de CLI e o mesmo shape de
 * saída (total_functions/average_crap/high_risk_functions/fallback_functions), para
 * harness.ts consumir sem diferenciar stack (ver crapTopText/readCrapReport).
 *
 * Requer, no repositório ALVO (não neste motor) — como `radon`/`pytest-cov` são do repo Python,
 * não do harness:
 *   - `eslintcc` (devDependency)
 *   - `@typescript-eslint/parser` (devDependency), só se houver arquivos .ts/.tsx
 * Resolvidos a partir de --source-dir via `createRequire`, nunca do node_modules deste motor.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const DEFAULT_COVERAGE_JSON = "coverage/coverage-final.json";
const DEFAULT_HIGH_RISK_THRESHOLD = 30;
const EXCLUDE_SEGMENTS = new Set(["tests", "test", "__tests__", "evals", "node_modules"]);
const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$/;
const TS_EXTENSIONS = new Set([".ts", ".tsx"]);
const ANALYSABLE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

class CoverageInputError extends Error {}

interface Loc {
  start: { line: number; column?: number };
  end: { line: number; column?: number };
}

interface IstanbulFileCoverage {
  statementMap?: Record<string, Loc>;
  fnMap?: Record<string, { name?: string; loc: Loc }>;
  s?: Record<string, number>;
  f?: Record<string, number>;
}

type IstanbulReport = Record<string, IstanbulFileCoverage>;

interface AnalyzedFunction {
  file: string;
  name: string;
  crap: number;
  comp: number;
  cov: number;
  coverage_source: string;
}

interface CrapReport {
  total_functions: number;
  average_crap: number;
  functions: AnalyzedFunction[];
  high_risk_functions: AnalyzedFunction[];
  fallback_functions: number;
  skipped_files: string[];
  coverage_json: string;
  threshold: number;
  only_paths: string[];
}

interface CliArgs {
  coverageJson: string;
  sourceDir: string;
  only: string[];
  threshold: number;
  jsonOut: string | null;
}

function calculateCrap(complexity: number, coveragePct: number): number {
  return complexity ** 2 * (1 - coveragePct / 100) ** 3 + complexity;
}

function normalisePath(p: string): string {
  return p.replace(/\\/g, "/").replace(/^\.\//, "");
}

function isExcluded(relPath: string): boolean {
  const normalised = normalisePath(relPath);
  if (TEST_FILE_PATTERN.test(normalised)) return true;
  return normalised.split("/").some((part) => EXCLUDE_SEGMENTS.has(part));
}

function relativeToSource(reportKey: string, sourceRoot: string): string {
  const abs = path.isAbsolute(reportKey) ? reportKey : path.resolve(sourceRoot, reportKey);
  return normalisePath(path.relative(sourceRoot, abs));
}

function loadCoverageReport(reportPath: string): IstanbulReport {
  if (!fs.existsSync(reportPath)) {
    throw new CoverageInputError(
      `Arquivo de cobertura não encontrado: ${reportPath}. Rode o test runner com um reporter ` +
        "Istanbul JSON primeiro (ex.: jest --coverage --coverageReporters=json, ou vitest run " +
        "--coverage --coverage.provider=istanbul --coverage.reporter=json)."
    );
  }
  let data: unknown;
  try {
    data = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  } catch (exc) {
    throw new CoverageInputError(`JSON de cobertura inválido em ${reportPath}: ${(exc as Error).message}`);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new CoverageInputError(
      `JSON de cobertura inválido em ${reportPath}: esperado um objeto {arquivo: cobertura} (formato Istanbul).`
    );
  }
  return data as IstanbulReport;
}

// Coverage por função: statements do statementMap cuja linha inicial cai dentro do range da
// função (mesmo princípio do "line-range fallback" da versão Python, mas usando o statementMap
// do Istanbul em vez de executed_lines/missing_lines). Sem nenhum statement mapeado no corpo
// (função vazia, ou só um retorno de expressão sem statement próprio), cai para a contagem de
// chamadas do fnMap mais próximo — sinal binário, documentado em coverage_source.
function functionCoverage(loc: Loc, fileCov: IstanbulFileCoverage): [number, string] {
  const statementMap = fileCov.statementMap ?? {};
  const hits = fileCov.s ?? {};
  let total = 0;
  let executed = 0;
  for (const [sid, stmt] of Object.entries(statementMap)) {
    if (stmt.start.line >= loc.start.line && stmt.start.line <= loc.end.line) {
      total += 1;
      if ((hits[sid] ?? 0) > 0) executed += 1;
    }
  }
  if (total > 0) return [(executed / total) * 100, "statementMap por linha"];

  const fnMap = fileCov.fnMap ?? {};
  const fnHits = fileCov.f ?? {};
  let closestId: string | null = null;
  let closestDist = Infinity;
  for (const [fid, fn] of Object.entries(fnMap)) {
    const dist = Math.abs(fn.loc.start.line - loc.start.line);
    if (dist < closestDist) {
      closestDist = dist;
      closestId = fid;
    }
  }
  const calls = closestId ? (fnHits[closestId] ?? 0) : 0;
  return [calls > 0 ? 100 : 0, "sem statement no corpo — contagem de chamadas (fnMap.f)"];
}

interface ComplexityMessage {
  type: string;
  loc: Loc;
  name: string;
  rules: Record<string, { value: number; rank: number; label: string }>;
}

// eslintcc e o `@typescript-eslint/parser` são dependências do repositório ALVO, não deste
// motor: resolvidos a partir de source_root, exatamente como `python -c "import radon"` resolve
// contra o interpretador/venv ativo, não contra este script.
function loadEslintcc(sourceRoot: string): { Complexity: new (opts: Record<string, unknown>) => {
  lintFiles(patterns: string[]): Promise<{ files: Array<{ file: string; messages: ComplexityMessage[] }> }>;
} } {
  const require = createRequire(path.join(sourceRoot, "noop.cjs"));
  try {
    return require("eslintcc");
  } catch {
    throw new CoverageInputError(
      "`eslintcc` não está instalado em " +
        `${sourceRoot} (devDependency) — necessário para medir complexidade em TS/JS. ` +
        "npm install --save-dev eslintcc @typescript-eslint/parser"
    );
  }
}

async function analyseFile(
  Complexity: new (opts: Record<string, unknown>) => {
    lintFiles(patterns: string[]): Promise<{ files: Array<{ file: string; messages: ComplexityMessage[] }> }>;
  },
  absFile: string,
  sourceRoot: string
): Promise<ComplexityMessage[]> {
  const isTs = TS_EXTENSIONS.has(path.extname(absFile));
  const complexity = new Complexity({
    rules: "complexity",
    eslintOptions: {
      cwd: sourceRoot,
      useEslintrc: false,
      overrideConfig: {
        parserOptions: { ecmaVersion: "latest", sourceType: "module" },
        ...(isTs ? { parser: "@typescript-eslint/parser" } : {}),
      },
    },
  });
  const report = await complexity.lintFiles([absFile]);
  return report.files[0]?.messages ?? [];
}

async function getCrapForCodebase(
  sourceDir: string,
  coverageJsonPath: string,
  onlyPaths: string[],
  threshold: number
): Promise<CrapReport> {
  const sourceRoot = path.resolve(sourceDir);
  const reportPath = path.resolve(coverageJsonPath);
  const coverageData = loadCoverageReport(reportPath);
  const wanted = new Set(onlyPaths.map((p) => normalisePath(p)));

  const includedEntries: Array<[string, string]> = []; // [relFilepath, reportKey]
  for (const reportKey of Object.keys(coverageData)) {
    const rel = relativeToSource(reportKey, sourceRoot);
    if (isExcluded(rel)) continue;
    if (wanted.size && !wanted.has(rel)) continue;
    if (!ANALYSABLE_EXTENSIONS.has(path.extname(rel))) continue;
    includedEntries.push([rel, reportKey]);
  }

  let Complexity: (new (opts: Record<string, unknown>) => {
    lintFiles(patterns: string[]): Promise<{ files: Array<{ file: string; messages: ComplexityMessage[] }> }>;
  }) | null = null;
  if (includedEntries.length) ({ Complexity } = loadEslintcc(sourceRoot));

  let totalCrap = 0;
  let totalFunctions = 0;
  let fallbackCount = 0;
  const analyzedFunctions: AnalyzedFunction[] = [];
  const highRiskFunctions: AnalyzedFunction[] = [];
  const skippedFiles: string[] = [];

  for (const [relFilepath, reportKey] of includedEntries) {
    const fileCov = coverageData[reportKey];
    const absFile = path.resolve(sourceRoot, relFilepath);
    if (!fs.existsSync(absFile)) {
      skippedFiles.push(`${relFilepath} (arquivo não encontrado)`);
      continue;
    }
    let messages: ComplexityMessage[];
    try {
      messages = await analyseFile(Complexity!, absFile, sourceRoot);
    } catch (exc) {
      skippedFiles.push(`${relFilepath} (${(exc as Error).name || "erro de parse"})`);
      continue;
    }
    for (const msg of messages) {
      if (msg.type !== "function") continue;
      const comp = msg.rules.complexity?.value;
      if (typeof comp !== "number") continue;
      const [coveragePct, coverageSource] = functionCoverage(msg.loc, fileCov);
      if (coverageSource.startsWith("sem statement")) fallbackCount += 1;
      const crapScore = calculateCrap(comp, coveragePct);
      totalCrap += crapScore;
      totalFunctions += 1;
      const entry: AnalyzedFunction = {
        file: relFilepath,
        name: msg.name,
        crap: crapScore,
        comp,
        cov: coveragePct,
        coverage_source: coverageSource,
      };
      analyzedFunctions.push(entry);
      if (crapScore > threshold) highRiskFunctions.push(entry);
    }
  }

  if (totalFunctions === 0 && !wanted.size) {
    throw new CoverageInputError("Nenhuma função de produção foi analisada no relatório informado.");
  }

  highRiskFunctions.sort((a, b) => b.crap - a.crap);
  const avgCrap = totalFunctions ? totalCrap / totalFunctions : 0;
  const result: CrapReport = {
    total_functions: totalFunctions,
    average_crap: avgCrap,
    functions: analyzedFunctions,
    high_risk_functions: highRiskFunctions,
    fallback_functions: fallbackCount,
    skipped_files: skippedFiles,
    coverage_json: reportPath,
    threshold,
    only_paths: [...wanted].sort(),
  };

  console.log("--- Relatório CRAP (TS/JS) ---");
  console.log(`Fonte de cobertura: ${reportPath}`);
  if (totalFunctions === 0) {
    console.log("Nenhuma função encontrada nos arquivos filtrados — sem sinal de CRAP.");
    return result;
  }
  console.log(`Total de funções analisadas: ${totalFunctions}`);
  console.log(`CRAP Médio da Codebase: ${avgCrap.toFixed(2)}`);
  if (fallbackCount) {
    console.log(
      `Aviso: ${fallbackCount} função(ões) usaram fallback por contagem de chamadas; sem ` +
        "statement mapeado no corpo, o sinal é binário (chamada existe ou não)."
    );
  }
  if (skippedFiles.length) {
    console.log(`Aviso: ${skippedFiles.length} arquivo(s) ignorado(s): ${skippedFiles.slice(0, 3).join(", ")}`);
  }
  if (highRiskFunctions.length) {
    console.log(`\n⚠️ Funções de Alto Risco (CRAP > ${threshold}):`);
    for (const fn of highRiskFunctions) {
      console.log(`- ${fn.file} -> ${fn.name}()`);
      console.log(`  CRAP: ${fn.crap.toFixed(2)} | Complexidade: ${fn.comp} | Cobertura: ${fn.cov.toFixed(1)}%`);
    }
  }
  return result;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    coverageJson: DEFAULT_COVERAGE_JSON,
    sourceDir: ".",
    only: [],
    threshold: DEFAULT_HIGH_RISK_THRESHOLD,
    jsonOut: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--coverage-json") args.coverageJson = argv[++i];
    else if (a === "--source-dir") args.sourceDir = argv[++i];
    else if (a === "--only") args.only.push(argv[++i]);
    else if (a === "--only-from") {
      const listPath = argv[++i];
      let lines: string[];
      try {
        lines = fs.readFileSync(listPath, "utf-8").split(/\r?\n/);
      } catch (exc) {
        throw new CoverageInputError(`Não foi possível ler a lista de arquivos ${listPath}: ${(exc as Error).message}`);
      }
      args.only.push(...lines.map((l) => l.trim()).filter(Boolean));
    } else if (a === "--threshold") args.threshold = Number(argv[++i]);
    else if (a === "--json-out") args.jsonOut = argv[++i];
    else if (!a.startsWith("--")) args.coverageJson = a; // posicional, paridade com a versão Python
  }
  return args;
}

function writeJsonReport(outPath: string, result: CrapReport): void {
  try {
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
  } catch (exc) {
    throw new CoverageInputError(`Não foi possível gravar o relatório JSON ${outPath}: ${(exc as Error).message}`);
  }
}

async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  try {
    const result = await getCrapForCodebase(args.sourceDir, args.coverageJson, args.only, args.threshold);
    if (args.jsonOut) writeJsonReport(args.jsonOut, result);
  } catch (exc) {
    if (exc instanceof CoverageInputError) {
      console.error(`Erro: ${exc.message}`);
      return 2;
    }
    throw exc;
  }
  return 0;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
