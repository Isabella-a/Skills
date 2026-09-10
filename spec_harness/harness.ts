#!/usr/bin/env -S node
/**
 * SDD Spec Harness — motor de enforcement da skill 'spec-harness'.
 *
 * Nada de stack fica hardcoded aqui: escopos, extensões, validadores globais e a etapa de
 * pós-verificação vêm de `.claude/spec_harness/harness.config.json` (ver SPEC_HARNESS_CONFIG).
 * Neste repositório o perfil é Python/FastAPI/LangGraph (ruff + pytest).
 *
 * Subcomandos:
 *   init-repo [--force]              (detecta o perfil do repo, cria a config e registra o hook)
 *   doctor [--json]                  (diagnóstico da config do repo: ERRO bloqueia, AVISO degrada)
 *   validate-spec <spec.md>
 *   validate-packet <packet.yaml>
 *   scaffold-packet <spec.md> [--force]
 *   autorun <SDD-NN.yaml> [--max-attempts N] [--no-merge]
 *   merge-spec <SDD-NN.yaml>
 *   expand-packet <SDD-NN.yaml>
 *   open-packet <packet.yaml>
 *   verify-packet <packet.yaml>
 *   run-spec <red.yaml> <green.yaml> <verify.yaml>
 *   run-parallel <red1> <green1> <verify1> -- <red2> <green2> <verify2> [-- ...] [--force]
 *   post-verify <verify.yaml>        (reexecuta a revisão automática de uma fase já verificada)
 *   discard-spec-worktree <worktree_path> [--delete-branch]
 *   hook-check                       (uso interno — chamado pelo hook PreToolUse)
 *
 * Só aceita packets com `schema_version: 2`. Veja .claude/skills/spec-harness/SKILL.md.
 *
 * Invocação: node <dir-do-motor>/harness.ts <comando> [args]. O motor costuma ficar instalado
 * em ~/.claude/spec_harness (global a todos os repos); a config, sempre no repo.
 *
 * Requer Node >= 22.18 (type stripping nativo — não precisa de tsx/ts-node). A única dependência
 * é `yaml`, instalada no node_modules ao lado do harness.ts.
 */

import { execFileSync, spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

const USAGE = `Subcomandos:
    init-repo [--force]              (detecta o perfil do repo, escreve
                                      .claude/spec_harness/harness.config.json e registra o hook)
    doctor [--json]                  (diz o que falta configurar neste repo, campo a campo)
    validate-spec <spec.md>
    validate-packet <packet.yaml>
    scaffold-packet <spec.md> [--force]   (gera o packet unificado SDD-NN.yaml a partir da spec)
    autorun <SDD-NN.yaml> [--max-attempts N] [--no-merge]
                                     (RED -> GREEN -> VERIFY numa invocação, sem voltar ao orquestrador)
    merge-spec <SDD-NN.yaml>         (mergeia a branch da spec depois de um autorun --no-merge)
    expand-packet <SDD-NN.yaml>      (só expande as três fases, para depurar)
    open-packet <packet.yaml>
    verify-packet <packet.yaml>
    run-spec <red.yaml> <green.yaml> <verify.yaml>   (modo manual, uma fase por invocação)
    run-parallel <red1> <green1> <verify1> -- <red2> <green2> <verify2> [-- ...] [--force]
    post-verify <verify.yaml>        (reexecuta a revisão automática de UMA spec — uso manual, não roda no autorun)
    review-feature <feature> --base <ref> [--branch <ref>] [--force]
                                     (code_review/ponytail_review sobre o diff acumulado da feature,
                                      depois que todas as specs já foram mergeadas)
    discard-spec-worktree <worktree_path> [--delete-branch]
    hook-check                       (uso interno — chamado pelo hook PreToolUse)`;

const REPO_ROOT = execFileSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf-8",
}).trim();

// O motor pode estar instalado global (~/.claude/spec_harness) ou dentro do repo. Tudo que é
// caminho de ferramenta ou de template resolve contra HARNESS_DIR; só a config é do repo.
const HARNESS_DIR = path.dirname(fileURLToPath(import.meta.url));
const SELF = path.join(HARNESS_DIR, "harness.ts");
// Instalado como plugin do Claude Code, o hook PreToolUse vem do próprio plugin (hooks/hooks.json,
// válido em toda sessão) e não precisa ser registrado repo a repo.
const PLUGIN_ROOT = (() => {
  const pai = path.dirname(HARNESS_DIR);
  return fs.existsSync(path.join(pai, ".claude-plugin", "plugin.json")) ? pai : null;
})();
const CLI = isWithin(SELF, REPO_ROOT)
  ? `node ${path.relative(REPO_ROOT, SELF)}`
  : `node ${SELF.startsWith(os.homedir()) ? SELF.replace(os.homedir(), "~") : SELF}`;
const HARNESS_HOME = process.env.SPEC_HARNESS_HOME || "/tmp/spec_harness";
const RUNS_DIR = path.join(HARNESS_HOME, "runs");
const ACTIVE_DIR = path.join(HARNESS_HOME, "active");
const WORKTREES_DIR = path.join(HARNESS_HOME, "worktrees");
const BLOCKED_DIR = path.join(HARNESS_HOME, "blocked");
const METRICS_FILE =
  process.env.SPEC_HARNESS_METRICS_FILE || path.join(HARNESS_HOME, "metrics.jsonl");

const CONFIG_PATH =
  process.env.SPEC_HARNESS_CONFIG || path.join(REPO_ROOT, ".claude/spec_harness/harness.config.json");
const ABERTO_MARKER = "⚠️ ABERTO:";
const ID_PATTERN = /\b(?:RF|EC|T)-\d+\b/g;

// Ignora ruído ao fazer fingerprint de árvore (caches de ferramenta, build outputs, etc).
const FINGERPRINT_IGNORE = new Set([
  ".git",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".venv",
  "htmlcov",
  "node_modules",
  "dist",
  "coverage",
]);

// --------------------------------------------------------------------------- tipos

interface ArtifactSpec {
  path: string;
  contains?: string[];
  not_contains?: string[];
  regex?: string[];
  not_regex?: string[];
  min_count?: number;
}

interface ValidationCommand {
  id: string;
  run: string;
  required_result?: "pass" | "fail";
  failure?: { returncodes?: number[]; output_contains?: string[]; output_excludes?: string[] };
}

interface Packet {
  schema_version?: number;
  packet_id?: string;
  feature?: string;
  spec_number?: number | string;
  phase?: string;
  source_spec?: string;
  app?: string;
  required_reads?: string[];
  capabilities?: {
    read?: { paths?: string[] };
    write?: { paths?: string[] };
    bash?: { commands?: string[] };
  };
  verifies?: { requirements?: string[] };
  done_when?: { requirements?: string[]; validation_ids?: string[] };
  validation?: { commands?: ValidationCommand[]; artifacts?: ArtifactSpec[] };
  token_budget?: Record<string, number>;
  enforcement?: { blocked_tool_calls?: string };
  manual_review?: unknown;
}

interface RunCapabilities {
  read: string[];
  write: string[];
  bash: string[];
}

interface RunState {
  run_id: string;
  key: string;
  branch: string;
  worktree: string;
  started_at: number;
  blocked_count: number;
  packet_path?: string;
  phase?: string;
  app?: string;
  capabilities?: RunCapabilities;
  enforcement?: string;
  baseline?: Record<string, string>;
}

interface ValidationResult {
  id: string;
  returncode: number;
  output: string;
}

// --------------------------------------------------------------------------- config do repo

interface ValidatorConfig {
  id: string;
  run: string;
  cwd?: string;
}

interface PostVerifyJob {
  id: string;
  prompt: string;
  add_dirs?: string[];
  plugin_dirs?: string[];
}

interface PostVerifyConfig {
  enabled?: boolean;
  model?: string;
  timeout_ms?: number;
  permission_mode?: string;
  allowed_tools?: string;
  gate?: "warn" | "block";
  require_quiz_pass?: boolean;
  jobs?: PostVerifyJob[];
}

interface CrapConfig {
  enabled?: boolean;
  gate?: "warn" | "block";
  threshold?: number;
  top_n?: number;
  tool?: string;
  runtime?: "python" | "node";
  python?: string;
  node?: string;
  coverage_command?: string;
  timeout_ms?: number;
  scope_tests?: Record<string, string[]>;
}

interface ScaffoldConfig {
  test_command_template?: string;
}

interface HarnessConfig {
  scaffold?: ScaffoldConfig;
  scopes?: Record<string, { paths?: string[] } | string>;
  source_extensions?: string[];
  test_markers?: { patterns?: string[] };
  validators?: Record<string, ValidatorConfig | null | string>;
  worktree?: { link_paths?: string[]; copy_paths?: string[] };
  crap?: CrapConfig;
  post_verify?: PostVerifyConfig;
}

interface CrapFunction {
  file: string;
  name: string;
  crap: number;
  comp: number;
  cov: number;
}

interface CrapReport {
  total_functions?: number;
  average_crap?: number;
  high_risk_functions?: CrapFunction[];
  fallback_functions?: number;
}

interface CrapSummary {
  gate: "warn" | "block";
  threshold: number;
  scored_files: string[];
  test_targets: string[];
  coverage_json: string | null;
  coverage_returncode: number;
  report: string | null;
  total_functions: number;
  average_crap: number;
  high_risk: CrapFunction[];
  errors: string[];
  note?: string;
}

interface PostVerifyResult {
  id: string;
  returncode: number;
  log: string;
  artifacts_dir: string;
  blocking_findings: number;
}

// --------------------------------------------------------------------------- utils

function ensureDirs(): void {
  for (const d of [RUNS_DIR, ACTIVE_DIR, WORKTREES_DIR, BLOCKED_DIR]) {
    fs.mkdirSync(d, { recursive: true });
  }
}

function die(msg: string, code = 1): never {
  console.error(`ERRO: ${msg}`);
  process.exit(code);
}

function loadYaml(p: string): Record<string, unknown> {
  if (!fs.existsSync(p)) die(`packet não encontrado: ${p}`);
  const data = parseYaml(fs.readFileSync(p, "utf-8"));
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    die(`packet malformado (esperado mapeamento YAML): ${p}`);
  }
  return data as Record<string, unknown>;
}

function loadConfig(): HarnessConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    die(
      `config do harness não encontrada: ${CONFIG_PATH} — ela é o que adapta o harness a este ` +
        `repositório (escopos, validadores, pós-verificação). Rode \`${CLI} init-repo\` para ` +
        "criar uma a partir do template e registrar o hook de path scoping."
    );
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as HarnessConfig;
}

// Carregada sob demanda: `init-repo` roda justamente em repositório que ainda não tem config.
let CONFIG_CACHE: HarnessConfig | null = null;
function CFG(): HarnessConfig {
  if (!CONFIG_CACHE) CONFIG_CACHE = loadConfig();
  return CONFIG_CACHE;
}

// Chaves iniciadas por '_' são comentários do JSON — nunca dados.
function realKeys(obj: Record<string, unknown> | undefined): string[] {
  return Object.keys(obj ?? {}).filter((k) => !k.startsWith("_"));
}

function scopeNames(): string[] {
  return realKeys(CFG().scopes as Record<string, unknown>);
}

function scopePaths(scope: string): string[] {
  const entry = CFG().scopes?.[scope];
  if (!entry || typeof entry === "string") return [];
  return entry.paths ?? [];
}

// Prefixos que pertencem *exclusivamente* a outros escopos — o análogo local da regra
// "um packet cobre um app só". Prefixos compartilhados (ex.: app/tests/) não contam.
function exclusiveForeignPaths(scope: string): Array<[string, string]> {
  const own = new Set(scopePaths(scope));
  const out: Array<[string, string]> = [];
  for (const other of scopeNames()) {
    if (other === scope) continue;
    for (const p of scopePaths(other)) if (!own.has(p)) out.push([other, p]);
  }
  return out;
}

function sourceExtensions(): string[] {
  return CFG().source_extensions ?? [];
}

function testMarkers(): string[] {
  return CFG().test_markers?.patterns ?? [];
}

function looksLikeTestPath(p: string): boolean {
  const lower = p.toLowerCase();
  return testMarkers().some((m) => lower.includes(m.toLowerCase()));
}

function globalValidators(): ValidatorConfig[] {
  const raw = CFG().validators ?? {};
  return realKeys(raw as Record<string, unknown>)
    .map((k) => raw[k])
    .filter((v): v is ValidatorConfig => !!v && typeof v === "object");
}

function postVerifyConfig(): PostVerifyConfig {
  return CFG().post_verify ?? {};
}

function crapConfig(): CrapConfig {
  return CFG().crap ?? {};
}

// Comando de teste que o scaffold escreve no packet. Fica na config porque é a única parte do
// scaffolder que é de stack: os gates só precisam do resultado, não do runner.
const DEFAULT_TEST_COMMAND = 'pytest -q --no-cov -p no:cacheprovider {test_paths} -m "not llm_integration"';

function scaffoldTestCommand(testArgs: string): string {
  const tmpl = CFG().scaffold?.test_command_template ?? DEFAULT_TEST_COMMAND;
  return tmpl.replaceAll("{test_paths}", testArgs);
}

// Ferramentas declaradas na config podem morar no motor (instalação global) ou no repo (fork
// local de uma ferramenta). Nesta ordem, para o repo poder sobrescrever nada silenciosamente.
function resolveEnginePath(p: string): string {
  if (path.isAbsolute(p)) return p;
  for (const base of [HARNESS_DIR, REPO_ROOT]) {
    const candidate = path.join(base, p);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(HARNESS_DIR, p);
}

function packetKey(packet: Packet): string {
  const feature = packet.feature;
  const specNumber = packet.spec_number;
  if (!feature || specNumber === undefined || specNumber === null) {
    die("packet precisa declarar 'feature' e 'spec_number'");
  }
  return `${feature}/${String(Number(specNumber)).padStart(2, "0")}`;
}

function branchFor(key: string): string {
  const [feature, num] = key.split("/");
  return `spec/${feature}/${num}`;
}

function currentBranch(): string {
  return execFileSync("git", ["-C", REPO_ROOT, "rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf-8",
  }).trim();
}

function sha256(p: string): string {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
  } catch {
    return "";
  }
}

function isIgnored(relPath: string): boolean {
  return relPath.split(path.sep).some((part) => FINGERPRINT_IGNORE.has(part));
}

function expandGlobs(root: string, patterns: string[]): string[] {
  const out = new Set<string>();
  for (const pattern of patterns) {
    for (const rel of fs.globSync(pattern, { cwd: root })) out.add(rel);
  }
  return [...out]
    .filter((rel) => {
      const abs = path.join(root, rel);
      return !isIgnored(rel) && fs.existsSync(abs) && fs.statSync(abs).isFile();
    })
    .sort();
}

// Traduz um padrão de glob para regex com a mesma semântica do `fnmatch` do Python
// (usado pelo packet original): `*`/`**` casam qualquer sequência, `?` um caractere.
function globToRegex(pattern: string): RegExp {
  let re = "";
  let i = 0;
  const n = pattern.length;
  while (i < n) {
    const c = pattern[i++];
    if (c === "*") {
      re += ".*";
    } else if (c === "?") {
      re += ".";
    } else if (c === "[") {
      let j = i;
      if (j < n && (pattern[j] === "!" || pattern[j] === "^")) j++;
      if (j < n && pattern[j] === "]") j++;
      while (j < n && pattern[j] !== "]") j++;
      if (j >= n) {
        re += "\\[";
      } else {
        let stuff = pattern.slice(i, j).replace(/\\/g, "\\\\");
        i = j + 1;
        if (stuff.startsWith("!")) stuff = "^" + stuff.slice(1);
        else if (stuff.startsWith("^")) stuff = "\\" + stuff;
        re += `[${stuff}]`;
      }
    } else {
      re += c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`^${re}$`);
}

function matchesAny(relPath: string, patterns: string[]): boolean {
  return patterns.some((p) => globToRegex(p).test(relPath));
}

function fingerprint(root: string, patterns: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rel of expandGlobs(root, patterns)) result[rel] = sha256(path.join(root, rel));
  return result;
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

function runCmd(cmd: string, cwd: string, timeoutMs = 600_000): RunResult {
  const res = spawnSync(cmd, {
    cwd,
    shell: "/bin/bash",
    timeout: timeoutMs,
    encoding: "utf-8",
    maxBuffer: 1024 * 1024 * 64,
  });
  return { code: res.status ?? 1, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

function appendMetric(entry: Record<string, unknown>): void {
  ensureDirs();
  fs.appendFileSync(METRICS_FILE, JSON.stringify({ ...entry, ts: Date.now() / 1000 }) + "\n", "utf-8");
}

function isWithin(child: string, parent: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

// --------------------------------------------------------------------------- validate-spec

function cmdValidateSpec(args: string[]): void {
  if (!args.length) die("uso: validate-spec <spec.md>");
  let specPath = args[0];
  if (!path.isAbsolute(specPath)) specPath = path.join(REPO_ROOT, specPath);
  if (!fs.existsSync(specPath)) die(`spec não encontrada: ${specPath}`);
  if (!`/${specPath}`.includes("/.specs/") && !specPath.includes("specs/")) {
    console.log("AVISO: spec fora do padrão .specs/sdd-<feature>/specs/ — confirme o caminho.");
  }

  const text = fs.readFileSync(specPath, "utf-8");
  const idsFound = [...new Set([...text.matchAll(ID_PATTERN)].map((m) => m[0]))].sort();
  const abertos = text.split(ABERTO_MARKER).length - 1;

  console.log(`Spec: ${specPath}`);
  console.log(`IDs encontrados (${idsFound.length}): ${idsFound.join(", ") || "(nenhum)"}`);
  if (abertos) {
    console.log(
      `AVISO: ${abertos} marcador(es) '${ABERTO_MARKER}' ainda presentes — resolva antes de gerar packets. ` +
        "verify-packet vai bloquear com isso pendente."
    );
  } else {
    console.log("OK: nenhum '⚠️ ABERTO:' pendente.");
  }
  if (!idsFound.length) {
    die("nenhum ID RF-*/EC-*/T-* encontrado na spec — spec incompleta ou fora do formato.");
  }
}

// --------------------------------------------------------------------------- validate-packet

function validatePacketStructure(packet: Packet): string[] {
  const errors: string[] = [];

  if (packet.schema_version !== 2) errors.push("schema_version deve ser 2");

  for (const field of ["packet_id", "feature", "spec_number", "phase", "source_spec", "app"] as const) {
    if (!Object.hasOwn(packet, field)) errors.push(`campo obrigatório ausente: ${field}`);
  }

  const phase = packet.phase;
  if (!phase || !["red", "green", "verify"].includes(phase)) {
    errors.push(`phase inválida: ${JSON.stringify(phase ?? null)} (esperado red|green|verify)`);
  }

  const app = packet.app;
  if (!app || !scopeNames().includes(app)) {
    errors.push(
      `app inválido: ${JSON.stringify(app ?? null)} (esperado um de ${scopeNames().join("|")} — ` +
        `definidos em ${path.relative(REPO_ROOT, CONFIG_PATH)})`
    );
  }

  const sourceSpec = packet.source_spec ?? "";
  if (sourceSpec && !`/${sourceSpec}`.includes("/.specs/") && !sourceSpec.startsWith(".specs/")) {
    errors.push("source_spec deve apontar para .specs/sdd-<feature>/specs/NN-*.md");
  }

  const requiredReads = packet.required_reads ?? [];
  if (sourceSpec && !requiredReads.includes(sourceSpec)) {
    errors.push("source_spec deve estar listado em required_reads");
  }

  const readPaths = packet.capabilities?.read?.paths ?? [];
  const writePaths = packet.capabilities?.write?.paths ?? [];
  if (sourceSpec && !matchesAny(sourceSpec, readPaths)) {
    errors.push("source_spec deve estar coberto por capabilities.read.paths");
  }

  if (phase === "verify" && writePaths.length) {
    errors.push("packets de fase verify não devem declarar capabilities.write.paths");
  }

  if (app && scopeNames().includes(app)) {
    const foreign = exclusiveForeignPaths(app);
    for (const p of [...readPaths, ...writePaths]) {
      const hit = foreign.find(([, prefix]) => p.startsWith(prefix));
      if (hit) {
        errors.push(
          `path '${p}' pertence ao escopo '${hit[0]}', não a '${app}' — um packet cobre um escopo só`
        );
      }
    }
    const own = scopePaths(app);
    for (const p of writePaths) {
      const inScope = own.some((prefix) => p.startsWith(prefix));
      const isSpecDir = p.startsWith(".specs/");
      if (!inScope && !isSpecDir) {
        errors.push(
          `capabilities.write.paths '${p}' fora dos prefixos do escopo '${app}' ` +
            `(${own.join(", ")})`
        );
      }
    }
  }

  if (phase === "red") {
    for (const p of writePaths) {
      if (!looksLikeTestPath(p)) errors.push(`RED só pode escrever testes/fixtures — path suspeito: ${p}`);
    }
  }
  if (phase === "green") {
    for (const p of writePaths) {
      if (looksLikeTestPath(p)) errors.push(`GREEN não deve escrever arquivos de teste — path suspeito: ${p}`);
    }
  }

  if (!packet.verifies?.requirements?.length) errors.push("verifies.requirements vazio ou ausente");
  if (!packet.done_when?.requirements?.length) errors.push("done_when.requirements vazio ou ausente");

  const validationIds = new Set((packet.validation?.commands ?? []).map((c) => c.id));
  for (const vid of packet.done_when?.validation_ids ?? []) {
    if (!validationIds.has(vid)) errors.push(`done_when.validation_ids referencia id inexistente: ${vid}`);
  }

  for (const cmd of packet.validation?.commands ?? []) {
    if (cmd.required_result === "fail") {
      const failure = cmd.failure ?? {};
      if (!failure.returncodes?.length && !failure.output_contains?.length && !failure.output_excludes?.length) {
        errors.push(
          `comando de validação '${cmd.id}' com required_result: fail precisa declarar ` +
            "failure.returncodes/output_contains/output_excludes"
        );
      }
    }
  }

  const budget = packet.token_budget ?? {};
  for (const field of ["max_initial_reads", "max_initial_read_bytes", "max_read_lines"]) {
    if (!(field in budget)) errors.push(`token_budget.${field} ausente`);
  }

  return errors;
}

function cmdValidatePacket(args: string[]): void {
  if (!args.length) die("uso: validate-packet <packet.yaml>");
  let packetPath = args[0];
  if (!path.isAbsolute(packetPath)) packetPath = path.join(REPO_ROOT, packetPath);
  const packet = loadYaml(packetPath) as Packet;
  const errors = validatePacketStructure(packet);
  if (errors.length) {
    console.log(`Packet inválido: ${packetPath}`);
    for (const e of errors) console.log(`  - ${e}`);
    process.exit(1);
  }
  console.log(`OK: packet válido — ${packetPath} (fase ${packet.phase}, app ${packet.app})`);
}

// --------------------------------------------------------------------------- open-packet

function runStatePath(runId: string): string {
  return path.join(RUNS_DIR, `${runId}.json`);
}

function activeStatePath(key: string): string {
  return path.join(ACTIVE_DIR, `${key.replace(/\//g, "__")}.json`);
}

function loadActiveRun(key: string): RunState | null {
  const p = activeStatePath(key);
  if (!fs.existsSync(p)) return null;
  const pointer = JSON.parse(fs.readFileSync(p, "utf-8")) as { run_id: string };
  const runPath = runStatePath(pointer.run_id);
  if (!fs.existsSync(runPath)) return null;
  return JSON.parse(fs.readFileSync(runPath, "utf-8")) as RunState;
}

function saveRun(run: RunState): void {
  fs.writeFileSync(runStatePath(run.run_id), JSON.stringify(run, null, 2), "utf-8");
}

function saveActive(key: string, runId: string): void {
  fs.writeFileSync(activeStatePath(key), JSON.stringify({ run_id: runId }), "utf-8");
}

// Traz para o worktree novo o estado local não versionado que os testes precisam.
// `link_paths` são diretórios pesados compartilháveis (num repo Node, node_modules); `copy_paths`
// são arquivos que cada worktree pode evoluir sozinho (ex.: .env). Neste repositório o ambiente
// Python é o conda 'one-assistant', global à máquina — não há nada para linkar.
function applyWorktreeExtras(worktree: string): void {
  for (const rel of CFG().worktree?.link_paths ?? []) {
    const src = path.join(REPO_ROOT, rel);
    const dst = path.join(worktree, rel);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.symlinkSync(src, dst, "dir");
    }
  }
  for (const rel of CFG().worktree?.copy_paths ?? []) {
    const src = path.join(REPO_ROOT, rel);
    const dst = path.join(worktree, rel);
    if (fs.existsSync(src) && !fs.existsSync(dst)) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
}

// Espelha no worktree os artefatos SDD deste packet (a spec Markdown e o que mais o packet
// declarar dentro de .specs/). Sem isso, uma spec ainda não commitada simplesmente não existe
// no worktree — o worktree nasce da branch, não da árvore de trabalho — e a sessão da fase
// termina sem escrever nada, pedindo a spec que o harness prometeu.
function syncSpecArtifacts(worktree: string, packet: Packet): void {
  const candidatos = [packet.source_spec ?? "", ...(packet.required_reads ?? [])];
  for (const rel of new Set(candidatos.filter((r) => r && r.startsWith(".specs/")))) {
    const src = path.join(REPO_ROOT, rel);
    if (!fs.existsSync(src) || fs.statSync(src).isDirectory()) continue;
    const dst = path.join(worktree, rel);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}

// Cria (ou reaproveita) o worktree/branch da spec e devolve o novo run state.
function openWorktreeFor(key: string): RunState {
  const branch = branchFor(key);
  const worktree = path.join(WORKTREES_DIR, key.replace(/\//g, "-"));
  ensureDirs();

  const branchExists = spawnSync("git", ["-C", REPO_ROOT, "rev-parse", "--verify", branch]).status === 0;

  if (fs.existsSync(worktree)) {
    // worktree já existe (fase anterior desta mesma spec) — reaproveita.
  } else if (branchExists) {
    execFileSync("git", ["-C", REPO_ROOT, "worktree", "add", worktree, branch]);
  } else {
    execFileSync("git", ["-C", REPO_ROOT, "worktree", "add", "-B", branch, worktree]);
  }

  applyWorktreeExtras(worktree);

  return {
    run_id: crypto.randomUUID(),
    key,
    branch,
    worktree,
    started_at: Date.now() / 1000,
    blocked_count: 0,
  };
}

function cmdOpenPacket(args: string[]): void {
  if (!args.length) die("uso: open-packet <packet.yaml>");
  const origArg = args[0];
  let packetPath = origArg;
  if (!path.isAbsolute(packetPath)) packetPath = path.join(REPO_ROOT, packetPath);
  const packet = loadYaml(packetPath) as Packet;
  const errors = validatePacketStructure(packet);
  if (errors.length) {
    console.error("Packet inválido — corrija antes de abrir:");
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const key = packetKey(packet);
  const existing = loadActiveRun(key);

  let run: RunState;
  if (existing && existing.packet_path === packetPath && existing.phase === packet.phase) {
    run = existing;
    console.log(`Reaproveitando execução ativa (run_id=${run.run_id}) para ${key}.`);
  } else {
    const base = existing ?? openWorktreeFor(key);
    run = { ...base };
    if (existing) run.run_id = existing.run_id;
    syncSpecArtifacts(run.worktree, packet);
    run.packet_path = packetPath;
    run.phase = packet.phase;
    run.app = packet.app;
    const writePaths = packet.capabilities?.write?.paths ?? [];
    const readPaths = packet.capabilities?.read?.paths ?? [];
    run.capabilities = { read: readPaths, write: writePaths, bash: packet.capabilities?.bash?.commands ?? [] };
    run.enforcement = packet.enforcement?.blocked_tool_calls ?? "review";
    run.baseline = fingerprint(run.worktree, [...new Set([...readPaths, ...writePaths])]);
    saveRun(run);
    saveActive(key, run.run_id);
  }

  console.log(`run_id: ${run.run_id}`);
  console.log(`branch: ${run.branch}`);
  console.log(`worktree: ${run.worktree}`);
  console.log(`fase: ${run.phase} (app: ${run.app})`);
  console.log(
    "\nTrabalhe DENTRO do worktree acima, respeitando capabilities.write.paths do packet.\n" +
      "Ao terminar a fase, rode:\n" +
      `  ${CLI} verify-packet ${origArg}`
  );
}

// --------------------------------------------------------------------------- verify-packet

function changedFiles(worktree: string, run: RunState): string[] {
  const baseline = run.baseline ?? {};
  const allPaths = [...new Set([...(run.capabilities?.read ?? []), ...(run.capabilities?.write ?? [])])].sort();
  const current = fingerprint(worktree, allPaths);
  return Object.keys(current).filter((p) => baseline[p] !== current[p]);
}

function checkArtifacts(worktree: string, artifacts: ArtifactSpec[]): string[] {
  const errors: string[] = [];
  for (const artifact of artifacts) {
    const p = path.join(worktree, artifact.path);
    if (!fs.existsSync(p)) {
      errors.push(`artifact ausente: ${artifact.path}`);
      continue;
    }
    const content = fs.readFileSync(p, "utf-8");
    for (const needle of artifact.contains ?? []) {
      if (!content.includes(needle)) errors.push(`${artifact.path}: esperava conter ${JSON.stringify(needle)}`);
    }
    for (const needle of artifact.not_contains ?? []) {
      if (content.includes(needle)) errors.push(`${artifact.path}: não deveria conter ${JSON.stringify(needle)}`);
    }
    for (const pattern of artifact.regex ?? []) {
      const matches = content.match(new RegExp(pattern, "g")) ?? [];
      const minCount = artifact.min_count ?? 1;
      if (matches.length < minCount) {
        errors.push(
          `${artifact.path}: regex ${JSON.stringify(pattern)} encontrada ${matches.length}x, esperado >= ${minCount}`
        );
      }
    }
    for (const pattern of artifact.not_regex ?? []) {
      if (new RegExp(pattern).test(content)) {
        errors.push(`${artifact.path}: regex proibida ${JSON.stringify(pattern)} encontrada`);
      }
    }
  }
  return errors;
}

function runValidationCommands(worktree: string, commands: ValidationCommand[]): [string[], ValidationResult[]] {
  const errors: string[] = [];
  const results: ValidationResult[] = [];
  for (const cmd of commands) {
    const { code, stdout, stderr } = runCmd(cmd.run, worktree);
    const combined = `${stdout}\n${stderr}`;
    results.push({ id: cmd.id, returncode: code, output: combined.slice(-4000) });
    const expected = cmd.required_result ?? "pass";
    if (expected === "pass") {
      if (code !== 0) errors.push(`comando '${cmd.id}' deveria passar, mas retornou ${code}`);
    } else {
      const failure = cmd.failure ?? {};
      if (failure.returncodes && !failure.returncodes.includes(code)) {
        errors.push(`comando '${cmd.id}' (RED) retornou ${code}, esperado um de ${JSON.stringify(failure.returncodes)}`);
      }
      for (const needle of failure.output_contains ?? []) {
        if (!combined.includes(needle)) errors.push(`comando '${cmd.id}' (RED): saída deveria conter ${JSON.stringify(needle)}`);
      }
      for (const needle of failure.output_excludes ?? []) {
        if (combined.includes(needle)) {
          errors.push(
            `comando '${cmd.id}' (RED): saída não deveria conter ${JSON.stringify(needle)} ` +
              "(indício de erro de import/sintaxe, não de comportamento ausente)"
          );
        }
      }
    }
  }
  return [errors, results];
}

function runGlobalValidators(worktree: string, app: string, changed: string[]): [string[], ValidationResult[]] {
  const errors: string[] = [];
  const results: ValidationResult[] = [];
  const prefixes = scopePaths(app);
  const exts = sourceExtensions();
  // Só arquivos de código do escopo tocado — spec Markdown, YAML de packet e evidência não
  // passam por lint.
  const targets = changed.filter(
    (f) => prefixes.some((prefix) => f.startsWith(prefix)) && exts.some((e) => f.endsWith(e))
  );
  if (!targets.length) return [errors, results];

  const fileArgs = targets.map((f) => `'${f}'`).join(" ");
  for (const validator of globalValidators()) {
    const cmd = validator.run.replace("{files}", fileArgs);
    const cwd = validator.cwd ? path.join(worktree, validator.cwd) : worktree;
    const r = runCmd(cmd, cwd);
    results.push({ id: validator.id, returncode: r.code, output: (r.stdout + r.stderr).slice(-4000) });
    if (r.code !== 0) errors.push(`${validator.id} falhou (${cmd}) — corrija antes de prosseguir`);
  }

  return [errors, results];
}

function blockedCalls(runId: string): Array<Record<string, unknown>> {
  const p = path.join(BLOCKED_DIR, `${runId}.jsonl`);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, "utf-8")
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l));
}

function evidencePathFor(packetPath: string): string {
  const ext = path.extname(packetPath);
  if (ext === ".yaml") return packetPath.slice(0, -ext.length) + ".evidence.json";
  return `${packetPath}.evidence.json`;
}

interface VerifyOutcome {
  ok: boolean;
  errors: string[];
  evidence_path: string;
  changed_files: string[];
}

// Núcleo da verificação de uma fase. `quiet` troca a impressão detalhada (usada quando um humano
// roda `verify-packet` na mão) por um retorno estruturado — é o que o autorun consome para decidir
// entre retentar a fase e devolver o controle ao orquestrador, sem despejar pytest no stdout dele.
async function verifyPacket(origArg: string, quiet = false): Promise<VerifyOutcome> {
  let packetPath = origArg;
  if (!path.isAbsolute(packetPath)) packetPath = path.join(REPO_ROOT, packetPath);
  const packet = loadYaml(packetPath) as Packet;

  const structErrors = validatePacketStructure(packet);
  const key = packetKey(packet);
  const run = loadActiveRun(key);

  if (!run || run.packet_path !== packetPath) {
    die(
      "não há execução ativa de open-packet para este packet. Rode " +
        `\`open-packet ${origArg}\` primeiro dentro da mesma sessão.`
    );
  }

  const worktree = run.worktree;
  const errors = [...structErrors];

  const specPath = path.join(REPO_ROOT, packet.source_spec ?? "");
  if (!fs.existsSync(specPath)) {
    errors.push(`spec não encontrada: ${specPath}`);
  } else {
    const specText = fs.readFileSync(specPath, "utf-8");
    if (specText.includes(ABERTO_MARKER)) {
      errors.push(`spec tem '${ABERTO_MARKER}' pendente — resolva antes de aprovar a fase`);
    }
    for (const rid of packet.verifies?.requirements ?? []) {
      if (!specText.includes(rid)) errors.push(`ID '${rid}' listado no packet mas ausente da spec`);
    }
  }

  const changed = changedFiles(worktree, run);
  const writePaths = run.capabilities?.write ?? [];
  const outOfScope = changed.filter((f) => !matchesAny(f, writePaths));
  if (outOfScope.length) errors.push(`alterações fora de capabilities.write.paths: ${JSON.stringify(outOfScope)}`);

  const [validationErrors, validationResults] = runValidationCommands(worktree, packet.validation?.commands ?? []);
  errors.push(...validationErrors);

  const artifactErrors = checkArtifacts(worktree, packet.validation?.artifacts ?? []);
  errors.push(...artifactErrors);

  const [globalErrors, globalResults] = runGlobalValidators(worktree, packet.app ?? "", changed);
  errors.push(...globalErrors);

  const blocked = blockedCalls(run.run_id);
  const enforcementMode = run.enforcement ?? "review";
  if (enforcementMode === "fail" && blocked.length) {
    errors.push(`${blocked.length} chamada(s) bloqueada(s) pelo hook — modo fail não tolera nenhuma`);
  }

  const gatesOk = errors.length === 0;
  const evidence = {
    packet: packetPath,
    run_id: run.run_id,
    phase: packet.phase,
    app: packet.app,
    branch: run.branch,
    worktree: run.worktree,
    changed_files: changed,
    validation_results: validationResults,
    global_validation_results: globalResults,
    blocked_tool_calls: blocked,
    enforcement_mode: enforcementMode,
    errors,
    status: gatesOk ? "ready_for_review" : "failed",
    manual_review: packet.manual_review ?? {},
    verified_at: Date.now() / 1000,
  };
  const evidencePath = evidencePathFor(packetPath);
  fs.writeFileSync(evidencePath, JSON.stringify(evidence, null, 2), "utf-8");

  appendMetric({
    run_id: run.run_id,
    packet: packetPath,
    phase: packet.phase,
    gates_ok: gatesOk,
    changed_files: changed.length,
    blocked_calls: blocked.length,
    validation_commands: validationResults.length,
    global_validators: globalResults.length,
  });

  if (!quiet) console.log(`Evidência gravada em: ${evidencePath}`);
  if (!gatesOk) {
    if (!quiet) {
      console.error("FALHOU — gates automáticos não passaram:");
      for (const e of errors) console.error(`  - ${e}`);
    }
    return { ok: false, errors, evidence_path: evidencePath, changed_files: changed };
  }

  if (changed.length) {
    spawnSync("git", ["-C", worktree, "add", ...changed]);
    const commitMsg = `spec(${run.key}): ${packet.phase} gates ok — ${packet.packet_id}`;
    spawnSync("git", ["-C", worktree, "commit", "-m", commitMsg]);
    if (!quiet) console.log(`Commit criado na branch ${run.branch}.`);
  }

  // Nem CRAP nem a revisão automática (code_review) rodam mais aqui: os dois são preparação para
  // a revisão por FEATURE, não gates mecânicos por spec — repeti-los a cada VERIFY era o maior
  // custo de token/tempo repetido do autorun. Ver `review-feature` e
  // `SKILL.md § Revisão automática`.

  if (!quiet) {
    console.log(
      "OK: gates automáticos passaram (status: ready_for_review). Isso NÃO é aprovação " +
        "semântica — revise contract.must/must_not e forbidden.behaviors em manual_review, " +
        "e leia os artefatos da revisão automática antes de mergear."
    );
  }
  return { ok: true, errors: [], evidence_path: evidencePath, changed_files: changed };
}

async function cmdVerifyPacket(args: string[]): Promise<void> {
  if (!args.length) die("uso: verify-packet <packet.yaml>");
  const outcome = await verifyPacket(args[0]);
  if (!outcome.ok) process.exit(1);
}


// --------------------------------------------------------------------------- crap

// Etapa determinística de risco: roda a suíte de cada escopo tocado com relatório JSON de
// cobertura e pontua CRAP ((complexidade^2 * (1-cobertura)^3) + complexidade) APENAS nas funções
// de PRODUÇÃO alteradas. Não abre sessão de modelo. CRAP é gameável por teste sem assert, então
// aqui ele é sinal para a revisão (via {crap_top}), nunca alvo de otimização de um agente.
//
// Não roda mais por spec: é preparação para a revisão por FEATURE (a skill de code review), não
// um gate do VERIFY — ver runFeatureReview. Por isso opera sobre o diff acumulado base...branch
// no branch de trabalho atual (REPO_ROOT), não num worktree de spec: quando isto roda, as specs
// já foram mergeadas.

function readCrapReport(reviewDir: string): CrapReport | null {
  const p = path.join(reviewDir, "crap.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8")) as CrapReport;
  } catch {
    return null;
  }
}

// Texto injetado no prompt do code review: transforma o número em pedido concreto de revisão.
function crapTopText(reviewDir: string): string {
  const report = readCrapReport(reviewDir);
  if (!report) {
    return "(sem relatório de CRAP nesta execução — ignore este critério)";
  }
  const top = (report.high_risk_functions ?? []).slice(0, crapConfig().top_n ?? 5);
  if (!top.length) {
    return `(nenhuma função acima do limiar de CRAP; média ${(report.average_crap ?? 0).toFixed(2)} em ${report.total_functions ?? 0} função(ões) alterada(s))`;
  }
  return top
    .map(
      (f) =>
        `- ${f.file} -> ${f.name}() — CRAP ${f.crap.toFixed(2)} (complexidade ${f.comp}, cobertura ${f.cov.toFixed(1)}%)`
    )
    .join("\n");
}

// Denominador de cobertura: a suíte do escopo inteiro, não só os arquivos da feature. Medir
// cobertura só pelo que a feature tocou infla o CRAP de código que a suíte já cobre.
function crapTestTargets(worktree: string, app: string): string[] {
  const declared = crapConfig().scope_tests?.[app];
  if (declared?.length) return declared;
  const out: string[] = [];
  for (const prefix of scopePaths(app)) {
    const trimmed = prefix.replace(/\/$/, "");
    if (looksLikeTestPath(prefix)) {
      out.push(trimmed);
      continue;
    }
    const candidate = `${trimmed}/tests`;
    if (fs.existsSync(path.join(worktree, candidate))) out.push(candidate);
  }
  return out;
}

function crapScopedFiles(scope: string, changedFiles: string[]): string[] {
  const prefixes = scopePaths(scope);
  const exts = sourceExtensions();
  return changedFiles.filter(
    (f) => prefixes.some((p) => f.startsWith(p)) && exts.some((e) => f.endsWith(e)) && !looksLikeTestPath(f)
  );
}

function runCrapForFeature(
  base: string,
  branch: string,
  reviewDir: string,
  quiet: boolean
): { summary: CrapSummary; errors: string[] } | null {
  const cfg = crapConfig();
  if (!cfg.enabled || !cfg.coverage_command || !cfg.tool) return null;

  const changedFiles = gitOut(["diff", "--name-only", `${base}...${branch}`])
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
  const touchedScopes = scopeNames().filter((scope) => crapScopedFiles(scope, changedFiles).length);
  if (!touchedScopes.length) return null;

  const gate = cfg.gate ?? "warn";
  const threshold = cfg.threshold ?? 30;
  const runtime = cfg.runtime ?? "node";
  const interpreter = runtime === "python" ? (cfg.python ?? "python") : (cfg.node ?? "node");
  const tool = resolveEnginePath(cfg.tool!);

  fs.mkdirSync(reviewDir, { recursive: true });
  const coverageDir = path.join(HARNESS_HOME, "coverage");
  fs.mkdirSync(coverageDir, { recursive: true });

  const errors: string[] = [];
  const notes: string[] = [];
  const summary: CrapSummary = {
    gate,
    threshold,
    scored_files: [],
    test_targets: [],
    coverage_json: null,
    coverage_returncode: 0,
    report: null,
    total_functions: 0,
    average_crap: 0,
    high_risk: [],
    errors: [],
  };
  let weightedSum = 0;

  for (const scope of touchedScopes) {
    const scoped = crapScopedFiles(scope, changedFiles);
    const testTargets = crapTestTargets(REPO_ROOT, scope);
    summary.scored_files.push(...scoped);
    if (!testTargets.length) {
      notes.push(`escopo '${scope}' não tem diretório de testes conhecido — configure crap.scope_tests`);
      continue;
    }
    summary.test_targets.push(...testTargets);

    if (!quiet) {
      console.log(
        `\nCRAP [${scope}] (gate: ${gate}, limiar ${threshold}) — ${scoped.length} arquivo(s), ` +
          `cobertura medida por: ${testTargets.join(" ")}`
      );
    }

    // Python (coverage.py) escreve exatamente no arquivo que --cov-report=json:{coverage_json}
    // apontar. Node (vitest/jest/nyc) só deixa escolher o DIRETÓRIO de relatórios — o nome do
    // arquivo (coverage-final.json) é fixo do reporter Istanbul — então {coverage_json} aqui
    // recebe o diretório, e o arquivo esperado é sempre <diretório>/coverage-final.json.
    const scopeCoverageDir = path.join(coverageDir, `feature-${scope}`);
    const scopeCoverageJson =
      runtime === "python" ? path.join(coverageDir, `feature-${scope}.json`) : path.join(scopeCoverageDir, "coverage-final.json");
    const coverageCommandArg = runtime === "python" ? scopeCoverageJson : scopeCoverageDir;
    const scopeListFile = path.join(reviewDir, `.crap-arquivos-${scope}.txt`);
    fs.writeFileSync(scopeListFile, scoped.join("\n") + "\n", "utf-8");

    const covCmd = cfg
      .coverage_command!.replaceAll("{coverage_json}", coverageCommandArg)
      .replaceAll("{test_targets}", testTargets.join(" "));
    const cov = runCmd(covCmd, REPO_ROOT, cfg.timeout_ms ?? 900_000);
    summary.coverage_returncode = cov.code;
    summary.coverage_json = scopeCoverageJson;
    if (!fs.existsSync(scopeCoverageJson)) {
      notes.push(`[${scope}] relatório de cobertura não gerado (exit ${cov.code}).`);
      continue;
    }

    const scopeCrapJson = path.join(reviewDir, `.crap-${scope}.json`);
    const toolCmd =
      `${interpreter} ${JSON.stringify(tool)} --coverage-json ${JSON.stringify(scopeCoverageJson)} ` +
      `--source-dir ${JSON.stringify(REPO_ROOT)} --only-from ${JSON.stringify(scopeListFile)} ` +
      `--threshold ${threshold} --json-out ${JSON.stringify(scopeCrapJson)}`;
    const toolRun = runCmd(toolCmd, REPO_ROOT, cfg.timeout_ms ?? 900_000);
    const report = fs.existsSync(scopeCrapJson)
      ? (JSON.parse(fs.readFileSync(scopeCrapJson, "utf-8")) as CrapReport)
      : null;
    fs.rmSync(scopeCrapJson, { force: true });
    fs.rmSync(scopeListFile, { force: true });
    if (!report) {
      notes.push(`[${scope}] crap_calculator não produziu relatório (exit ${toolRun.code}).`);
      continue;
    }

    summary.total_functions += report.total_functions ?? 0;
    weightedSum += (report.average_crap ?? 0) * (report.total_functions ?? 0);
    summary.high_risk.push(...(report.high_risk_functions ?? []));
  }

  summary.average_crap = summary.total_functions ? weightedSum / summary.total_functions : 0;
  summary.high_risk.sort((a, b) => b.crap - a.crap);
  if (notes.length) summary.note = notes.join(" | ");

  fs.writeFileSync(path.join(reviewDir, "crap-arquivos.txt"), summary.scored_files.join("\n") + "\n", "utf-8");
  fs.writeFileSync(
    path.join(reviewDir, "crap.json"),
    JSON.stringify(
      { total_functions: summary.total_functions, average_crap: summary.average_crap, high_risk_functions: summary.high_risk },
      null,
      2
    ),
    "utf-8"
  );
  summary.report = path.relative(REPO_ROOT, path.join(reviewDir, "crap.json"));

  if (!summary.total_functions) {
    if (!quiet) console.log(`  AVISO (crap): ${summary.note ?? "nenhuma função analisada."}`);
    return { summary, errors };
  }

  if (!quiet) {
    console.log(
      `\nCRAP (feature): ${summary.total_functions} função(ões) pontuada(s), CRAP médio ` +
        `${summary.average_crap.toFixed(2)} — ${summary.high_risk.length} acima de ${threshold}`
    );
    for (const f of summary.high_risk.slice(0, cfg.top_n ?? 5)) {
      console.log(`    ${f.file} -> ${f.name}() CRAP ${f.crap.toFixed(2)} (comp ${f.comp}, cov ${f.cov.toFixed(1)}%)`);
    }
  }

  if (summary.high_risk.length) {
    const msg = `${summary.high_risk.length} função(ões) alterada(s) com CRAP > ${threshold} — ver ${summary.report}`;
    if (gate === "block") {
      errors.push(msg);
      summary.errors.push(msg);
    } else if (!quiet) {
      console.log(`  AVISO (crap): ${msg}`);
    }
  }

  return { summary, errors };
}

// --------------------------------------------------------------------------- post-verify

// Revisão automática que roda DEPOIS que a fase VERIFY passa nos gates e commita: um agente de
// code review e o loop cognitivo (explain-diff + micro mundos + quiz), em paralelo, cada um numa
// sessão `claude -p` headless com o modelo declarado na config (sonnet, por custo). O harness não
// escreve prompt nenhum: eles vêm de post_verify.jobs[].prompt na config.

function gitOut(args: string[], cwd = REPO_ROOT): string {
  const r = spawnSync("git", ["-C", cwd, ...args], { encoding: "utf-8" });
  return r.status === 0 ? (r.stdout ?? "").trim() : "";
}

// Diretório dos artefatos de revisão da spec: .specs/sdd-<feature>/reviews/<NN>/
function reviewDirFor(packet: Packet): string {
  const spec = packet.source_spec ?? "";
  const marker = "/specs/";
  const featureDir = spec.includes(marker) ? spec.slice(0, spec.indexOf(marker)) : path.dirname(spec);
  const num = String(Number(packet.spec_number ?? 0)).padStart(2, "0");
  return path.join(REPO_ROOT, featureDir, "reviews", num);
}

function interpolate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => vars[key] ?? whole);
}

function runClaudeJob(
  job: PostVerifyJob,
  vars: Record<string, string>,
  cfg: PostVerifyConfig,
  logPath: string
): Promise<PostVerifyResult> {
  const args = [
    "-p",
    interpolate(job.prompt, vars),
    "--model",
    cfg.model ?? "sonnet",
    "--permission-mode",
    cfg.permission_mode ?? "acceptEdits",
    "--output-format",
    "text",
    "--allowedTools",
    cfg.allowed_tools ?? "Read Grep Glob Bash Write Edit",
  ];
  for (const d of job.add_dirs ?? []) args.push("--add-dir", d);
  for (const d of job.plugin_dirs ?? []) args.push("--plugin-dir", d);

  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn("claude", args, {
      cwd: REPO_ROOT,
      env: process.env,
      timeout: cfg.timeout_ms ?? 2_400_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: string[] = [];
    child.stdout.on("data", (d) => chunks.push(String(d)));
    child.stderr.on("data", (d) => chunks.push(String(d)));
    child.on("error", (err) => {
      chunks.push(`\n[spawn error] ${String(err)}`);
    });
    child.on("close", (code) => {
      const elapsed = ((Date.now() - started) / 1000).toFixed(0);
      const output = chunks.join("");
      fs.writeFileSync(logPath, output, "utf-8");
      console.log(`  [${job.id}] terminou em ${elapsed}s (exit ${code ?? 1}) — log: ${logPath}`);
      resolve({
        id: job.id,
        returncode: code ?? 1,
        log: logPath,
        artifacts_dir: vars.out,
        blocking_findings: 0,
      });
    });
  });
}

// Lê o veredito estruturado que o job de code review deve gravar. Ausência de arquivo é
// inconclusivo, não aprovação — por isso vira aviso explícito, nunca 0 silencioso.
function readReviewVerdict(reviewDir: string): { found: boolean; blocking: number } {
  const p = path.join(reviewDir, "code-review.json");
  if (!fs.existsSync(p)) return { found: false, blocking: 0 };
  try {
    const data = JSON.parse(fs.readFileSync(p, "utf-8")) as {
      blocking?: boolean;
      findings?: Array<{ blocking?: boolean }>;
    };
    const blocking = (data.findings ?? []).filter((f) => f.blocking).length;
    return { found: true, blocking: blocking || (data.blocking ? 1 : 0) };
  } catch {
    return { found: false, blocking: 0 };
  }
}

// Marcador de "esta spec já foi revisada": a revisão automática é cara (duas sessões sonnet com
// repo-grounding) e o resultado só muda se o código mudar. Reverificar a fase VERIFY — o que
// acontece a cada retry do autorun — não pode disparar tudo de novo.
function postVerifyMarker(reviewDir: string): string {
  return path.join(reviewDir, ".post-verify.json");
}

async function runPostVerify(
  packet: Packet,
  run: RunState,
  force = false
): Promise<{ results: PostVerifyResult[]; errors: string[]; reviewDir: string }> {
  const cfg = postVerifyConfig();
  const jobs = (cfg.jobs ?? []).filter((j) => j && j.id && j.prompt);
  const reviewDir = reviewDirFor(packet);
  if (!cfg.enabled || !jobs.length) return { results: [], errors: [], reviewDir };

  const marker = postVerifyMarker(reviewDir);
  if (!force && fs.existsSync(marker)) {
    const previous = JSON.parse(fs.readFileSync(marker, "utf-8")) as {
      results?: PostVerifyResult[];
      errors?: string[];
      head_sha?: string;
    };
    console.log(
      `  revisão automática já executada para esta spec (${previous.head_sha ?? "?"}) — ` +
        `reaproveitando ${path.relative(REPO_ROOT, reviewDir)}/. Para refazer: ` +
        `\`harness.ts post-verify <verify.yaml>\`.`
    );
    return { results: previous.results ?? [], errors: previous.errors ?? [], reviewDir };
  }

  fs.mkdirSync(reviewDir, { recursive: true });
  const target = currentBranch();
  const base = gitOut(["merge-base", target, run.branch]) || target;
  const headSha = gitOut(["rev-parse", "--short", run.branch]);

  const vars: Record<string, string> = {
    spec: packet.source_spec ?? "",
    feature: String(packet.feature ?? ""),
    num: String(Number(packet.spec_number ?? 0)).padStart(2, "0"),
    branch: run.branch,
    base,
    head_sha: headSha,
    out: path.relative(REPO_ROOT, reviewDir),
    worktree: run.worktree,
    app: String(packet.app ?? ""),
    crap_top: crapTopText(reviewDir),
  };

  console.log(
    `\nRevisão automática pós-VERIFY (${cfg.model ?? "sonnet"}, ${jobs.length} agentes em paralelo): ` +
      `${jobs.map((j) => j.id).join(", ")}`
  );
  console.log(`  diff revisado: git diff ${base}...${run.branch}`);
  console.log(`  artefatos em: ${vars.out}/`);

  const results = await Promise.all(
    jobs.map((job) => runClaudeJob(job, vars, cfg, path.join(reviewDir, `${job.id}.log`)))
  );

  const errors: string[] = [];
  const verdict = readReviewVerdict(reviewDir);
  for (const r of results) {
    if (r.id === "code_review") r.blocking_findings = verdict.blocking;
    if (r.returncode !== 0) {
      const msg = `agente '${r.id}' terminou com exit ${r.returncode} — ver ${r.log}`;
      if ((cfg.gate ?? "warn") === "block") errors.push(msg);
      else console.log(`  AVISO: ${msg}`);
    }
  }
  if (!verdict.found) {
    console.log(
      "  AVISO: code-review.json não foi gravado — revisão inconclusiva, leia o log antes de mergear."
    );
  } else if (verdict.blocking) {
    const msg = `code review apontou ${verdict.blocking} achado(s) bloqueante(s) — ver ${path.relative(REPO_ROOT, reviewDir)}/code-review.md`;
    if ((cfg.gate ?? "warn") === "block") errors.push(msg);
    else console.log(`  AVISO: ${msg}`);
  }

  fs.writeFileSync(
    postVerifyMarker(reviewDir),
    JSON.stringify({ head_sha: headSha, at: Date.now() / 1000, results, errors }, null, 2),
    "utf-8"
  );

  return { results, errors, reviewDir };
}

async function cmdPostVerify(args: string[]): Promise<void> {
  if (!args.length) die("uso: post-verify <verify.yaml>");
  let packetPath = args[0];
  if (!path.isAbsolute(packetPath)) packetPath = path.join(REPO_ROOT, packetPath);
  const packet = loadYaml(packetPath) as Packet;
  const run = loadActiveRun(packetKey(packet));
  if (!run) die("não há execução ativa para esta spec — rode run-spec/open-packet antes.");
  // Invocação explícita é sempre refazimento: ignora o marcador.
  const { errors } = await runPostVerify(packet, run, true);
  if (errors.length) {
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

// --------------------------------------------------------------------------- review-feature

// Revisão automática por FEATURE, não por spec: CRAP e code_review rodam UMA vez sobre o diff
// acumulado de todas as specs já mergeadas na branch de trabalho, em vez de repetir os mesmos
// passos (cada um custando sessão/suíte de teste inteira) a cada spec — que era o maior custo
// repetido do autorun. CRAP roda primeiro, aqui mesmo: ele é preparação para a skill de code
// review (via {crap_top}), não um gate mecânico do VERIFY. Diferença central em relação a
// runPostVerify: aqui as specs já foram mergeadas, então "gate: block" não impede merge nenhum —
// é sinal para quem orquestra revisar, não enforcement.
async function runFeatureReview(
  feature: string,
  base: string,
  branch: string,
  force: boolean
): Promise<{ results: PostVerifyResult[]; errors: string[]; reviewDir: string }> {
  const cfg = postVerifyConfig();
  const jobs = (cfg.jobs ?? []).filter((j) => j && j.id && j.prompt);
  const featureDir = path.join(REPO_ROOT, ".specs", `sdd-${feature}`);
  const reviewDir = path.join(featureDir, "reviews", "feature");
  if (!cfg.enabled || !jobs.length) return { results: [], errors: [], reviewDir };

  const marker = postVerifyMarker(reviewDir);
  const headSha = gitOut(["rev-parse", "--short", branch]);
  if (!force && fs.existsSync(marker)) {
    const previous = JSON.parse(fs.readFileSync(marker, "utf-8")) as {
      results?: PostVerifyResult[];
      errors?: string[];
      head_sha?: string;
    };
    if (previous.head_sha === headSha) {
      console.log(
        `  revisão da feature já executada neste head (${headSha}) — reaproveitando ` +
          `${path.relative(REPO_ROOT, reviewDir)}/. Para refazer: --force.`
      );
      return { results: previous.results ?? [], errors: previous.errors ?? [], reviewDir };
    }
  }

  fs.mkdirSync(reviewDir, { recursive: true });

  const errors: string[] = [];
  const crapResult = runCrapForFeature(base, branch, reviewDir, false);
  if (crapResult) errors.push(...crapResult.errors);

  const vars: Record<string, string> = {
    feature,
    branch,
    base,
    head_sha: headSha,
    out: path.relative(REPO_ROOT, reviewDir),
    crap_top: crapTopText(reviewDir),
  };

  console.log(
    `\nRevisão automática por feature (${cfg.model ?? "sonnet"}, ${jobs.length} agentes em paralelo): ` +
      `${jobs.map((j) => j.id).join(", ")}`
  );
  console.log(`  diff revisado: git diff ${base}...${branch}`);
  console.log(`  artefatos em: ${vars.out}/`);

  const results = await Promise.all(
    jobs.map((job) => runClaudeJob(job, vars, cfg, path.join(reviewDir, `${job.id}.log`)))
  );

  const verdict = readReviewVerdict(reviewDir);
  for (const r of results) {
    if (r.id === "code_review") r.blocking_findings = verdict.blocking;
    if (r.returncode !== 0) {
      const msg = `agente '${r.id}' terminou com exit ${r.returncode} — ver ${r.log}`;
      if ((cfg.gate ?? "warn") === "block") errors.push(msg);
      else console.log(`  AVISO: ${msg}`);
    }
  }
  if (!verdict.found) {
    console.log("  AVISO: code-review.json não foi gravado — revisão inconclusiva, leia o log.");
  } else if (verdict.blocking) {
    const msg = `code review apontou ${verdict.blocking} achado(s) bloqueante(s) — ver ${path.relative(REPO_ROOT, reviewDir)}/code-review.md`;
    if ((cfg.gate ?? "warn") === "block") errors.push(msg);
    else console.log(`  AVISO: ${msg}`);
  }

  fs.writeFileSync(
    marker,
    JSON.stringify({ head_sha: headSha, at: Date.now() / 1000, results, errors }, null, 2),
    "utf-8"
  );

  return { results, errors, reviewDir };
}

async function cmdReviewFeature(args: string[]): Promise<void> {
  if (!args.length) {
    die("uso: review-feature <feature-slug> --base <ref> [--branch <ref>] [--force]");
  }
  const feature = args[0];
  const baseIdx = args.indexOf("--base");
  const branchIdx = args.indexOf("--branch");
  const force = args.includes("--force");
  if (baseIdx === -1 || !args[baseIdx + 1]) {
    die(
      "review-feature precisa de --base <ref> explícito (ex.: o commit onde a feature começou, " +
        "ou a branch default do repo) — o harness não adivinha onde a feature divergiu."
    );
  }
  const base = args[baseIdx + 1];
  const branch = branchIdx !== -1 && args[branchIdx + 1] ? args[branchIdx + 1] : currentBranch();

  const featureDir = path.join(REPO_ROOT, ".specs", `sdd-${feature}`);
  if (!fs.existsSync(featureDir)) {
    die(`pasta não encontrada: ${path.relative(REPO_ROOT, featureDir)}`);
  }

  const { errors } = await runFeatureReview(feature, base, branch, force);
  if (errors.length) {
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
}

// --------------------------------------------------------------------------- run-spec

interface Triplet {
  key: string;
  byPhase: Record<string, [string, string]>;
  loaded: Packet[];
}

function loadTriplet(origArgs: string[]): Triplet {
  if (origArgs.length !== 3) die("cada spec precisa de exatamente 3 packets: red, green, verify");
  const resolved = origArgs.map((a) => (path.isAbsolute(a) ? a : path.join(REPO_ROOT, a)));
  const loaded = resolved.map((p) => loadYaml(p) as Packet);
  const key = packetKey(loaded[0]);
  for (const p of loaded.slice(1)) {
    if (packetKey(p) !== key) die("os três packets precisam ser da mesma feature/spec_number");
  }

  const byPhase: Record<string, [string, string]> = {};
  loaded.forEach((p, i) => {
    if (p.phase) byPhase[p.phase] = [origArgs[i], resolved[i]];
  });
  const expectedPhases = ["green", "red", "verify"];
  if (Object.keys(byPhase).sort().join(",") !== expectedPhases.join(",")) {
    die("os três packets precisam cobrir exatamente as fases red, green e verify");
  }

  return { key, byPhase, loaded };
}

// Executa (ou avança) uma spec até a próxima fase pendente. Usado por run-spec (uma spec) e
// run-parallel (várias specs, uma chamada por spec — cada uma com seu próprio worktree).
function runSpecTriplet({ key, byPhase, loaded }: Triplet): void {
  const run = loadActiveRun(key);
  const evidences: Record<string, Record<string, unknown>> = {};
  for (const phase of ["red", "green", "verify"]) {
    const [, resolvedPath] = byPhase[phase];
    const evPath = evidencePathFor(resolvedPath);
    if (fs.existsSync(evPath)) evidences[phase] = JSON.parse(fs.readFileSync(evPath, "utf-8"));
  }

  for (const phase of ["red", "green", "verify"]) {
    const ev = evidences[phase];
    if (ev && ev.status === "ready_for_review") {
      console.log(`[${key}/${phase}] já verificado e commitado — pulando.`);
      continue;
    }

    const [origArg, resolvedPath] = byPhase[phase];
    console.log(`\n=== ${key} — Fase ${phase.toUpperCase()} ===`);
    if (!run || run.phase !== phase || run.packet_path !== resolvedPath) {
      cmdOpenPacket([origArg]);
    } else {
      console.log(`Execução já aberta para a fase ${phase} (run_id=${run.run_id}).`);
    }
    const nextStep =
      phase === "verify"
        ? "re-invoque `run-spec` (ou `run-parallel`) com os mesmos packets — isso vai mergear " +
          "automaticamente a branch da spec na branch de trabalho e apagá-la. Faça a revisão " +
          "semântica (references/verify.md) ANTES disso, não depois."
        : "re-invoque `run-spec` (ou `run-parallel`) com os mesmos packets para avançar para a próxima fase.";
    console.log(
      `\nParada aqui — implemente a fase ${phase.toUpperCase()} agora dentro do worktree acima e depois rode:\n` +
        `  ${CLI} verify-packet ${origArg}\n` +
        `Depois de verificado (status ready_for_review), ${nextStep}`
    );
    return;
  }

  if (!run) {
    console.log(`[${key}] já mergeada e limpa anteriormente — nada a fazer.`);
    return;
  }
  console.log(
    `\n[${key}] As três fases (RED, GREEN, VERIFY) têm evidência ready_for_review — mergeando ` +
      "automaticamente na branch de trabalho e removendo a branch/worktree da spec."
  );
  mergeSpecBranch(key, run);
}

function cmdRunSpec(args: string[]): void {
  if (args.length !== 3) die("uso: run-spec <red.yaml> <green.yaml> <verify.yaml>");
  runSpecTriplet(loadTriplet(args));
}

// --------------------------------------------------------------------------- run-parallel

function collectPaths(loaded: Packet[], kind: "read" | "write"): string[] {
  return [...new Set(loaded.flatMap((p) => p.capabilities?.[kind]?.paths ?? []))];
}

// Aproxima "interseção" entre dois globs pelo prefixo literal antes do primeiro wildcard —
// suficiente para o caso real: paths de specs diferentes são diretórios distintos por
// construção (um context/use-case ou uma screen por spec), então overlap de prefixo já denuncia
// write/write ou write/read real, sem precisar expandir os globs no disco.
function globPrefix(pattern: string): string {
  const idx = pattern.search(/[*?[]/);
  let prefix = idx === -1 ? pattern : pattern.slice(0, idx);
  if (!prefix.endsWith("/")) {
    const slash = prefix.lastIndexOf("/");
    prefix = slash === -1 ? "" : prefix.slice(0, slash + 1);
  }
  return prefix;
}

function prefixesOverlap(a: string, b: string): boolean {
  if (!a || !b) return true; // prefixo vazio (glob começa com wildcard) — trate como overlap.
  return a === b || a.startsWith(b) || b.startsWith(a);
}

function pathSetConflicts(patternsA: string[], patternsB: string[]): string[] {
  const conflicts: string[] = [];
  for (const a of patternsA) {
    for (const b of patternsB) {
      if (prefixesOverlap(globPrefix(a), globPrefix(b))) conflicts.push(`${a} × ${b}`);
    }
  }
  return conflicts;
}

function cmdRunParallel(args: string[]): void {
  const force = args.includes("--force");
  const filtered = args.filter((a) => a !== "--force");

  const groups: string[][] = [];
  let current: string[] = [];
  for (const a of filtered) {
    if (a === "--") {
      if (current.length) groups.push(current);
      current = [];
    } else {
      current.push(a);
    }
  }
  if (current.length) groups.push(current);

  if (groups.length < 2) {
    die(
      "uso: run-parallel <red1> <green1> <verify1> -- <red2> <green2> <verify2> [-- ...] [--force] " +
        "(pelo menos 2 specs — para 1 spec use run-spec)"
    );
  }
  for (const g of groups) {
    if (g.length !== 3) {
      die(`cada spec precisa de exatamente 3 packets (red, green, verify) — grupo com ${g.length}: ${g.join(", ")}`);
    }
  }

  const triplets = groups.map(loadTriplet);
  const keys = triplets.map((t) => t.key);
  const dupKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (dupKeys.length) die(`spec repetida em run-parallel: ${[...new Set(dupKeys)].join(", ")}`);

  const writeSets = triplets.map((t) => collectPaths(t.loaded, "write"));
  const readSets = triplets.map((t) => collectPaths(t.loaded, "read"));

  const conflicts: string[] = [];
  for (let i = 0; i < triplets.length; i++) {
    for (let j = i + 1; j < triplets.length; j++) {
      for (const c of pathSetConflicts(writeSets[i], writeSets[j])) {
        conflicts.push(`write/write entre ${keys[i]} e ${keys[j]}: ${c}`);
      }
      for (const c of pathSetConflicts(writeSets[i], readSets[j])) {
        conflicts.push(`write/read entre ${keys[i]} (write) e ${keys[j]} (read): ${c}`);
      }
      for (const c of pathSetConflicts(writeSets[j], readSets[i])) {
        conflicts.push(`write/read entre ${keys[j]} (write) e ${keys[i]} (read): ${c}`);
      }
    }
  }

  if (conflicts.length) {
    console.error(
      force
        ? "AVISO: conflitos de capabilities detectados — seguindo por --force (risco real de uma " +
            "spec pisar no worktree/commit da outra):"
        : "BLOQUEADO: specs com capabilities write/write ou write/read sobrepostas não podem rodar " +
            "em paralelo (rode-as em sequência com run-spec, ou corrija o escopo dos packets):"
    );
    for (const c of [...new Set(conflicts)]) console.error(`  - ${c}`);
    if (!force) process.exit(1);
  }

  console.log(`Abrindo ${triplets.length} specs em paralelo (um worktree por spec): ${keys.join(", ")}`);
  triplets.forEach((triplet, i) => {
    console.log(`\n########## [${i + 1}/${triplets.length}] spec ${triplet.key} ##########`);
    runSpecTriplet(triplet);
  });
}

// --------------------------------------------------------------------------- discard-spec-worktree

// Remove os ponteiros de execução ativa (ACTIVE_DIR) que apontam para este run_id — usado
// depois de mergear/descartar uma spec, para que o próximo open-packet comece do zero.
function clearActiveRun(runId: string): void {
  for (const f of fs.readdirSync(ACTIVE_DIR).filter((f) => f.endsWith(".json"))) {
    const fullPath = path.join(ACTIVE_DIR, f);
    try {
      const pointer = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as { run_id: string };
      if (pointer.run_id === runId) fs.unlinkSync(fullPath);
    } catch {
      continue;
    }
  }
}

// Mergeia a branch da spec (com os commits por fase RED/GREEN/VERIFY) na branch de trabalho
// atual e remove o worktree/branch da spec. Chamado automaticamente por run-spec/run-parallel
// quando as três fases já estão ready_for_review — não há pausa para merge manual.
function mergeSpecBranch(key: string, run: RunState): void {
  const target = currentBranch();

  // Trava do /quizzes: só mergeia se o dev tiver gabaritado o quiz da ponta desta branch.
  if (postVerifyConfig().require_quiz_pass) {
    const sha = gitOut(["rev-parse", "--short", run.branch]);
    const marker = path.join(REPO_ROOT, ".cognitive-loop", "quiz", `${sha}.passed`);
    if (!fs.existsSync(marker)) {
      die(
        `[${key}] quiz da mudança ainda não foi gabaritado (${path.relative(REPO_ROOT, marker)} ` +
          "ausente) — abra o quiz.html gerado pela revisão automática e acerte tudo, ou desligue " +
          "post_verify.require_quiz_pass na config. Nada foi mergeado nem apagado."
      );
    }
  }
  if (target === run.branch) {
    console.log(`[${key}] branch de trabalho já é ${run.branch} — nada para mergear.`);
  } else {
    console.log(`\n[${key}] Mergeando ${run.branch} em ${target}...`);
    const merge = spawnSync("git", ["-C", REPO_ROOT, "merge", "--no-edit", run.branch], { encoding: "utf-8" });
    if (merge.status !== 0) {
      console.error((merge.stdout ?? "") + (merge.stderr ?? ""));
      die(
        `merge de ${run.branch} em ${target} falhou (provável conflito) — resolva manualmente. ` +
          `O worktree ${run.worktree} e a branch ${run.branch} NÃO foram removidos.`
      );
    }
    console.log(`Merge concluído em ${target}.`);
  }

  execFileSync("git", ["-C", REPO_ROOT, "worktree", "remove", run.worktree, "--force"]);
  spawnSync("git", ["-C", REPO_ROOT, "branch", "-D", run.branch]);
  clearActiveRun(run.run_id);
  console.log(`Worktree removido e branch ${run.branch} apagada.`);
}

function cmdDiscardSpecWorktree(args: string[]): void {
  if (!args.length) die("uso: discard-spec-worktree <worktree_path> [--delete-branch]");
  const worktree = args[0];
  const deleteBranch = args.includes("--delete-branch");

  let branch: string | null = null;
  if (deleteBranch) {
    const res = spawnSync("git", ["-C", worktree, "rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf-8" });
    branch = res.status === 0 ? res.stdout.trim() : null;
  }

  execFileSync("git", ["-C", REPO_ROOT, "worktree", "remove", worktree, "--force"]);
  console.log(`Worktree removido: ${worktree}`);

  if (deleteBranch && branch) {
    spawnSync("git", ["-C", REPO_ROOT, "branch", "-D", branch]);
    console.log(`Branch removida: ${branch}`);
  }

  for (const f of fs.readdirSync(ACTIVE_DIR).filter((f) => f.endsWith(".json"))) {
    const fullPath = path.join(ACTIVE_DIR, f);
    try {
      const pointer = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as { run_id: string };
      const run = JSON.parse(fs.readFileSync(runStatePath(pointer.run_id), "utf-8")) as RunState;
      if (run.worktree === worktree) fs.unlinkSync(fullPath);
    } catch {
      continue;
    }
  }
}

// --------------------------------------------------------------------------- hook-check

function targetPath(input: Record<string, unknown>, worktree: string): string | null {
  for (const k of ["file_path", "path", "notebook_path"]) {
    const val = input[k];
    if (typeof val === "string") return isWithin(val, worktree) ? path.relative(worktree, val) : val;
  }
  return null;
}

function findRunForCwd(cwd: string): RunState | null {
  if (!fs.existsSync(RUNS_DIR)) return null;
  for (const f of fs.readdirSync(RUNS_DIR).filter((f) => f.endsWith(".json"))) {
    const candidate = JSON.parse(fs.readFileSync(path.join(RUNS_DIR, f), "utf-8")) as RunState;
    if (cwd === candidate.worktree || isWithin(cwd, candidate.worktree)) return candidate;
  }
  return null;
}

interface HookPayload {
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
}

// Entry point do hook PreToolUse. Lê JSON do stdin, decide allow/block.
// No-op (allow) fora de um worktree com execução ativa do spec-harness — não afeta o
// uso normal do Claude Code neste repositório.
function cmdHookCheck(): void {
  let payload: HookPayload = {};
  try {
    payload = JSON.parse(fs.readFileSync(0, "utf-8") || "{}");
  } catch {
    process.exit(0); // payload inesperado — não bloqueia por segurança de regressão
  }

  const toolName = payload.tool_name ?? "";
  const toolInput = payload.tool_input ?? {};
  const cwd = payload.cwd ?? process.cwd();

  const run = findRunForCwd(cwd);
  if (!run) process.exit(0);

  const caps = run.capabilities ?? { read: [], write: [], bash: [] };
  let allowed = true;
  let reason = "";

  if (["Read", "Glob", "Grep", "NotebookEdit"].includes(toolName)) {
    const p = targetPath(toolInput, run.worktree);
    if (p && !matchesAny(p, [...caps.read, ...caps.write])) {
      allowed = false;
      reason = `path fora de capabilities.read.paths: ${p}`;
    }
  } else if (["Write", "Edit"].includes(toolName)) {
    const p = targetPath(toolInput, run.worktree);
    if (p && !matchesAny(p, caps.write)) {
      allowed = false;
      reason = `path fora de capabilities.write.paths: ${p}`;
    }
  } else if (toolName === "Bash") {
    const command = (toolInput.command as string) ?? "";
    if (command.includes("spec_harness/harness.ts") || command.startsWith("git ")) {
      allowed = true;
    } else if (!caps.bash.some((c) => command === c || command.startsWith(c))) {
      allowed = false;
      reason = `comando fora de capabilities.bash.commands: ${command}`;
    }
  } else {
    allowed = false;
    reason = `ferramenta '${toolName}' sem regra declarada no packet — bloqueada por padrão`;
  }

  if (allowed) process.exit(0);

  fs.mkdirSync(BLOCKED_DIR, { recursive: true });
  fs.appendFileSync(
    path.join(BLOCKED_DIR, `${run.run_id}.jsonl`),
    JSON.stringify({ ts: Date.now() / 1000, tool_name: toolName, tool_input: toolInput, reason }) + "\n",
    "utf-8"
  );

  console.error(reason);
  process.exit(2);
}

// --------------------------------------------------------------------------- packet unificado

/**
 * Um único YAML por spec, com as três fases derivadas dele. O que antes eram três arquivos
 * escritos à mão (SDD-NN-red/green/verify.yaml) vira um só: os campos que mudam entre as fases
 * — o que pode ser escrito, o que a validação espera — são função da fase, não escolha do autor.
 * Os packets por fase continuam existindo, mas expandidos em packets/.expanded/ pelo harness.
 */
interface UnifiedPhase {
  requirements?: string[];
  artifacts?: ArtifactSpec[];
  extra_commands?: ValidationCommand[];
}

interface UnifiedPacket {
  schema_version?: number;
  unified?: boolean;
  feature?: string;
  spec_number?: number | string;
  app?: string;
  source_spec?: string;
  required_reads?: string[];
  context_paths?: string[];
  test_paths?: string[];
  impl_paths?: string[];
  test_command?: string;
  red_expects?: "behavior_change" | "new_module";
  missing_module?: string;
  verifies?: { requirements?: string[] };
  phases?: Record<string, UnifiedPhase>;
  enforcement?: { blocked_tool_calls?: string };
  manual_review?: unknown;
}

const PHASES = ["red", "green", "verify"] as const;
type Phase = (typeof PHASES)[number];

function isUnified(doc: Record<string, unknown>): boolean {
  return doc.unified === true || Object.hasOwn(doc, "phases");
}

function padNum(n: number | string | undefined): string {
  return String(Number(n ?? 0)).padStart(2, "0");
}

// Falha do RED aceita por fase. Em Python o RED de módulo inexistente quebra na coleta, e coleta
// quebrada é indistinguível de typo no import — por isso `new_module` exige o nome exato do módulo
// ausente na saída, e `behavior_change` proíbe qualquer erro de import.
function redFailureSpec(u: UnifiedPacket): ValidationCommand["failure"] {
  if (u.red_expects === "new_module") {
    const mod = u.missing_module;
    if (!mod) die("red_expects: new_module exige o campo missing_module (nome dotted do módulo ausente)");
    return {
      returncodes: [1],
      output_contains: ["failed", `No module named '${mod}'`],
      output_excludes: ["INTERNALERROR", "no tests ran"],
    };
  }
  return {
    returncodes: [1],
    output_contains: ["failed"],
    output_excludes: ["ModuleNotFoundError", "ImportError", "SyntaxError", "INTERNALERROR", "no tests ran"],
  };
}

function buildPhasePacket(u: UnifiedPacket, phase: Phase): Packet {
  const spec = u.source_spec ?? "";
  const testPaths = u.test_paths ?? [];
  const implPaths = u.impl_paths ?? [];
  const requiredReads = [...new Set([spec, ...(u.required_reads ?? [])])].filter(Boolean);
  // O conjunto de leitura é o mesmo nas três fases: o RED precisa do código de produção para
  // escrever teste contra o contrato real, e o GREEN precisa do teste que tem de passar.
  const readPaths = [...new Set([...requiredReads, ...(u.context_paths ?? []), ...testPaths, ...implPaths])];
  const writePaths = phase === "red" ? testPaths : phase === "green" ? implPaths : [];
  const allIds = u.verifies?.requirements ?? [];
  const phaseCfg = u.phases?.[phase] ?? {};
  const testCommand = u.test_command ?? "";

  const commands: ValidationCommand[] = [];
  if (phase === "red") {
    commands.push({ id: "test_red", run: testCommand, required_result: "fail", failure: redFailureSpec(u) });
  } else {
    commands.push({ id: `test_${phase}`, run: testCommand, required_result: "pass" });
  }
  commands.push(...(phaseCfg.extra_commands ?? []));

  return {
    schema_version: 2,
    packet_id: `SDD-${padNum(u.spec_number)}-${phase}`,
    feature: u.feature,
    spec_number: u.spec_number,
    phase,
    app: u.app,
    source_spec: spec,
    required_reads: requiredReads,
    verifies: { requirements: allIds },
    done_when: {
      requirements: phaseCfg.requirements?.length ? phaseCfg.requirements : allIds,
      validation_ids: [phase === "red" ? "test_red" : `test_${phase}`],
    },
    capabilities: {
      read: { paths: readPaths },
      write: { paths: writePaths },
      bash: { commands: [testCommand, "ruff check"].filter(Boolean) },
    },
    token_budget: {
      max_initial_reads: 8,
      max_initial_read_bytes: 400000,
      max_read_lines: 500,
      max_search_results: 50,
    },
    validation: { commands, artifacts: phaseCfg.artifacts ?? [] },
    enforcement: u.enforcement ?? { blocked_tool_calls: "review" },
    manual_review: u.manual_review ?? {},
  };
}

// Materializa os três packets por fase em packets/.expanded/. Ficam em disco porque a evidência,
// o run state e o hook são todos indexados por caminho de packet — e porque, quando um gate
// reprova, ter o YAML efetivo no disco é o que torna o diagnóstico possível.
function expandUnified(unifiedPath: string): { key: string; byPhase: Record<Phase, string>; unified: UnifiedPacket } {
  const abs = path.isAbsolute(unifiedPath) ? unifiedPath : path.join(REPO_ROOT, unifiedPath);
  const u = loadYaml(abs) as UnifiedPacket;
  if (!isUnified(u as unknown as Record<string, unknown>)) {
    die(`${unifiedPath} não é um packet unificado (falta 'phases:' / 'unified: true')`);
  }
  if (!u.test_command) die("packet unificado exige test_command");
  if (!(u.test_paths ?? []).length) die("packet unificado exige test_paths (o que a fase RED escreve)");
  if (!(u.impl_paths ?? []).length) die("packet unificado exige impl_paths (o que a fase GREEN escreve)");

  const outDir = path.join(path.dirname(abs), ".expanded");
  fs.mkdirSync(outDir, { recursive: true });

  const byPhase = {} as Record<Phase, string>;
  const errors: string[] = [];
  for (const phase of PHASES) {
    const packet = buildPhasePacket(u, phase);
    const out = path.join(outDir, `SDD-${padNum(u.spec_number)}-${phase}.yaml`);
    fs.writeFileSync(
      out,
      `# GERADO por harness.ts a partir de ${path.relative(REPO_ROOT, abs)} — não edite à mão.\n` +
        stringifyYaml(packet, { lineWidth: 0, aliasDuplicateObjects: false }),
      "utf-8"
    );
    byPhase[phase] = out;
    for (const e of validatePacketStructure(packet)) errors.push(`[${phase}] ${e}`);
  }
  if (errors.length) {
    console.error(`Packet unificado inválido: ${path.relative(REPO_ROOT, abs)}`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  return { key: packetKey(buildPhasePacket(u, "red")), byPhase, unified: u };
}

function cmdExpandPacket(args: string[]): void {
  if (!args.length) die("uso: expand-packet <SDD-NN.yaml>");
  const { key, byPhase } = expandUnified(args[0]);
  console.log(`OK: ${key} expandido em:`);
  for (const phase of PHASES) console.log(`  ${phase}: ${path.relative(REPO_ROOT, byPhase[phase])}`);
}

// --------------------------------------------------------------------------- scaffold-packet

// Extrai da spec Markdown o que o packet precisa. Depende do formato que a skill 'sdd' produz:
// seção `## Arquivos permitidos` com os blocos `**Produção (fase GREEN)**` e `**Testes (fase RED)**`,
// paths em crase. O que não der para inferir sai como TODO explícito no YAML, nunca como palpite.
function extractSection(text: string, heading: string): string {
  const lines = text.split("\n");
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${heading}`.toLowerCase());
  if (start === -1) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.startsWith("## "));
  return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

// A seção 'Arquivos permitidos' é uma sequência de blocos rotulados em negrito
// (**Produção (fase GREEN)**, **Testes (fase RED)**, **Proibido tocar:** ...). Só as linhas de
// bullet de cada bloco valem como path — a prosa do bloco 'Proibido tocar' cita paths de outros
// escopos, e varrer a seção inteira em busca de crases arrastaria esses paths para dentro do
// packet.
function blocosRotulados(section: string): Array<{ label: string; paths: string[] }> {
  const blocos: Array<{ label: string; paths: string[] }> = [];
  let atual: { label: string; paths: string[] } | null = null;
  for (const line of section.split("\n")) {
    const bold = line.match(/^\s*\*\*(.+?)\*\*/);
    if (bold) {
      atual = { label: bold[1], paths: [] };
      blocos.push(atual);
      continue;
    }
    if (!atual || !/^\s*[-*]\s/.test(line)) continue;
    for (const m of line.matchAll(/`([^`]+)`/g)) {
      if (m[1].startsWith("app/")) atual.paths.push(m[1]);
    }
  }
  return blocos.map((b) => ({ label: b.label, paths: [...new Set(b.paths)] }));
}

function scopeForPaths(paths: string[]): string | null {
  const hits = new Set<string>();
  for (const scope of scopeNames()) {
    for (const prefix of scopePaths(scope)) {
      if (paths.some((p) => p.startsWith(prefix))) hits.add(scope);
    }
  }
  // app/tests/ pertence a dois escopos por construção — desempata pelo escopo exclusivo.
  const exclusive = [...hits].filter((s) => paths.some((p) => scopePaths(s).some((pre) => pre.startsWith("app/plataformas/") && p.startsWith(pre))));
  if (exclusive.length === 1) return exclusive[0];
  if (hits.size === 1) return [...hits][0];
  return null;
}

function dottedModule(p: string): string {
  return p.replace(/^app\//, "").replace(/\.py$/, "").replace(/\//g, ".");
}

function cmdScaffoldPacket(args: string[]): void {
  if (!args.length) die("uso: scaffold-packet <spec.md> [--force]");
  const force = args.includes("--force");
  const specArg = args.find((a) => !a.startsWith("--")) ?? "";
  const specPath = path.isAbsolute(specArg) ? specArg : path.join(REPO_ROOT, specArg);
  if (!fs.existsSync(specPath)) die(`spec não encontrada: ${specPath}`);
  const specRel = path.relative(REPO_ROOT, specPath);

  const m = specRel.match(/\.specs\/sdd-([^/]+)\/specs\/(\d+)-/);
  if (!m) die(`spec fora do padrão .specs/sdd-<feature>/specs/NN-<nome>.md: ${specRel}`);
  const [, feature, numRaw] = m;
  const specNumber = Number(numRaw);

  const text = fs.readFileSync(specPath, "utf-8");
  const ids = [...new Set([...text.matchAll(ID_PATTERN)].map((x) => x[0]))].sort(
    (a, b) => a.localeCompare(b, "en", { numeric: true })
  );
  if (!ids.length) die("nenhum ID RF-*/EC-*/T-* na spec — rode validate-spec antes.");
  if (text.includes(ABERTO_MARKER)) {
    die(`spec ainda tem '${ABERTO_MARKER}' pendente — resolva antes de gerar o packet.`);
  }

  const permitidos = extractSection(text, "Arquivos permitidos");
  const notes: string[] = [];
  let implPaths: string[] = [];
  let testPaths: string[] = [];
  if (permitidos) {
    const blocos = blocosRotulados(permitidos);
    const prod = blocos.find((b) => /produ[çc][ãa]o/i.test(b.label));
    const teste = blocos.find((b) => /teste/i.test(b.label));
    if (prod || teste) {
      implPaths = prod?.paths ?? [];
      testPaths = teste?.paths ?? [];
    } else {
      const all = blocos.flatMap((b) => b.paths);
      testPaths = all.filter((p) => looksLikeTestPath(p));
      implPaths = all.filter((p) => !looksLikeTestPath(p));
      notes.push("seção 'Arquivos permitidos' sem blocos **Produção**/**Testes** — separação inferida por path");
    }
  } else {
    notes.push("spec sem seção '## Arquivos permitidos' — preencha impl_paths/test_paths à mão");
  }

  const app = scopeForPaths([...implPaths, ...testPaths]);
  if (!app) notes.push("escopo (app) não inferido dos paths — preencha o campo 'app' à mão");

  const missingImpl = implPaths.filter((p) => !fs.existsSync(path.join(REPO_ROOT, p)) && p.endsWith(".py"));
  const allImplNew = implPaths.length > 0 && missingImpl.length === implPaths.filter((p) => p.endsWith(".py")).length;
  const redExpects = allImplNew ? "new_module" : "behavior_change";
  if (allImplNew) {
    notes.push(`red_expects: new_module (todo o código de produção é novo) — missing_module = ${dottedModule(missingImpl[0])}`);
  }

  const testArgs = testPaths.length ? testPaths.join(" ") : "<TODO: arquivos de teste>";
  const packet: UnifiedPacket = {
    schema_version: 2,
    unified: true,
    feature,
    spec_number: specNumber,
    app: app ?? "TODO",
    source_spec: specRel,
    required_reads: [specRel],
    context_paths: [],
    test_paths: testPaths.length ? testPaths : ["TODO"],
    impl_paths: implPaths.length ? implPaths : ["TODO"],
    test_command: scaffoldTestCommand(testArgs),
    red_expects: redExpects,
    ...(allImplNew ? { missing_module: dottedModule(missingImpl[0]) } : {}),
    verifies: { requirements: ids },
    phases: { red: {}, green: {}, verify: {} },
    enforcement: { blocked_tool_calls: "review" },
    manual_review: { contract: { must: [], must_not: [] }, forbidden: { behaviors: [] }, review: { focus: [] } },
  };

  const outDir = path.join(REPO_ROOT, ".specs", `sdd-${feature}`, "packets");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `SDD-${padNum(specNumber)}.yaml`);
  if (fs.existsSync(outPath) && !force) {
    die(`${path.relative(REPO_ROOT, outPath)} já existe — use --force para sobrescrever.`);
  }
  fs.writeFileSync(
    outPath,
    `# Packet unificado da spec ${specRel}\n` +
      "# Gerado por: harness.ts scaffold-packet. As três fases (RED/GREEN/VERIFY) são derivadas daqui.\n" +
      stringifyYaml(packet, { lineWidth: 0, aliasDuplicateObjects: false }),
    "utf-8"
  );

  console.log(`Packet gravado: ${path.relative(REPO_ROOT, outPath)}`);
  console.log(`  app: ${packet.app} | ${ids.length} IDs | ${testPaths.length} teste(s) | ${implPaths.length} arquivo(s) de produção`);
  if (notes.length) {
    console.log("Confira antes de rodar o autorun:");
    for (const n of notes) console.log(`  - ${n}`);
  }
  const todo = JSON.stringify(packet).includes("TODO");
  if (todo) die("packet tem campos TODO — preencha antes de rodar autorun.");
}

// --------------------------------------------------------------------------- autorun

interface ImplementerConfig {
  model?: string;
  timeout_ms?: number;
  permission_mode?: string;
  allowed_tools?: string;
  max_attempts?: number;
  prompts?: Record<string, string>;
}

function implementerConfig(): ImplementerConfig {
  return (CFG() as HarnessConfig & { implementer?: ImplementerConfig }).implementer ?? {};
}

function autorunLogDir(key: string): string {
  const dir = path.join(HARNESS_HOME, "logs", key.replace(/\//g, "-"));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Sessão headless que implementa UMA fase dentro do worktree da spec. O modelo aqui é o barato
// (sonnet por padrão): o contexto dele é o packet daquela fase, e o hook PreToolUse do harness
// continua valendo porque o cwd é o worktree com execução ativa.
function runImplementer(
  phase: Phase,
  packet: Packet,
  run: RunState,
  feedback: string,
  logPath: string
): Promise<number> {
  const cfg = implementerConfig();
  const template = cfg.prompts?.[phase];
  if (!template) die(`implementer.prompts.${phase} ausente em ${path.relative(REPO_ROOT, CONFIG_PATH)}`);

  const prompt = interpolate(template, {
    spec: packet.source_spec ?? "",
    phase,
    app: packet.app ?? "",
    worktree: run.worktree,
    requirements: (packet.done_when?.requirements ?? []).join(", "),
    write_paths: (packet.capabilities?.write?.paths ?? []).join("\n  - "),
    read_paths: (packet.capabilities?.read?.paths ?? []).join("\n  - "),
    test_command: (packet.validation?.commands ?? [])[0]?.run ?? "",
    feedback: feedback || "(primeira tentativa — nenhum gate reprovado ainda)",
  });

  const args = [
    "-p",
    prompt,
    "--model",
    cfg.model ?? "sonnet",
    "--permission-mode",
    cfg.permission_mode ?? "acceptEdits",
    "--output-format",
    "text",
    "--allowedTools",
    cfg.allowed_tools ?? "Read Grep Glob Bash Write Edit",
  ];

  return new Promise((resolve) => {
    const child = spawn("claude", args, {
      cwd: run.worktree,
      env: process.env,
      timeout: cfg.timeout_ms ?? 2_400_000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks: string[] = [];
    child.stdout.on("data", (d) => chunks.push(String(d)));
    child.stderr.on("data", (d) => chunks.push(String(d)));
    child.on("error", (err) => chunks.push(`\n[spawn error] ${String(err)}`));
    child.on("close", (code) => {
      fs.writeFileSync(logPath, chunks.join(""), "utf-8");
      resolve(code ?? 1);
    });
  });
}

/**
 * RED → GREEN → VERIFY numa única invocação, sem devolver o controle ao orquestrador entre as
 * fases. Cada fase é uma sessão headless própria; o handoff entre elas é o commit da fase anterior
 * na branch da spec, que é determinístico e não passa por modelo nenhum. O orquestrador vê uma
 * linha por fase e o resumo final — não vê o código, nem a saída do pytest, nem os logs.
 */
async function cmdAutorun(args: string[]): Promise<void> {
  if (!args.length) die("uso: autorun <SDD-NN.yaml> [--max-attempts N] [--no-merge]");
  const noMerge = args.includes("--no-merge");
  const attemptsArg = args.indexOf("--max-attempts");
  const packetArg = args.find((a) => !a.startsWith("--") && a !== args[attemptsArg + 1]) ?? args[0];

  const { key, byPhase } = expandUnified(packetArg);
  const maxAttempts =
    attemptsArg !== -1 ? Number(args[attemptsArg + 1]) : (implementerConfig().max_attempts ?? 2);
  const logDir = autorunLogDir(key);
  const started = Date.now();

  console.log(`=== autorun ${key} — RED → GREEN → VERIFY (até ${maxAttempts} tentativa(s) por fase) ===`);
  console.log(`logs: ${logDir}`);

  const summary: Array<{ phase: Phase; attempts: number; ok: boolean; changed: number }> = [];

  for (const phase of PHASES) {
    const packetPath = byPhase[phase];
    const evPath = evidencePathFor(packetPath);
    if (fs.existsSync(evPath)) {
      const ev = JSON.parse(fs.readFileSync(evPath, "utf-8")) as { status?: string };
      if (ev.status === "ready_for_review") {
        console.log(`[${phase}] já verificado em execução anterior — pulando.`);
        summary.push({ phase, attempts: 0, ok: true, changed: 0 });
        continue;
      }
    }

    cmdOpenPacket([packetPath]);
    const run = loadActiveRun(key);
    if (!run) die(`falha ao abrir a execução da fase ${phase}`);
    const packet = loadYaml(packetPath) as Packet;

    // VERIFY não abre sessão de modelo: a fase não pode escrever nada, e tudo que ela faz — rodar
    // validation.commands, ruff e os artifacts — já é o próprio verifyPacket. Uma sessão aqui só
    // gastaria tokens para observar um resultado que o harness produz sozinho.
    const usaImplementador = phase !== "verify";
    const tentativasDaFase = usaImplementador ? maxAttempts : 1;

    let feedback = "";
    let ok = false;
    let changed = 0;
    let attempt = 0;
    while (attempt < tentativasDaFase && !ok) {
      attempt += 1;
      const logPath = path.join(logDir, `${phase}-${attempt}.log`);
      const t0 = Date.now();
      const code = usaImplementador ? await runImplementer(phase, packet, run, feedback, logPath) : 0;
      const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
      const outcome = await verifyPacket(packetPath, true);
      ok = outcome.ok;
      changed = outcome.changed_files.length;
      console.log(
        usaImplementador
          ? `[${phase}] tentativa ${attempt}/${tentativasDaFase}: implementador exit ${code} em ${elapsed}s, ` +
              `${changed} arquivo(s) alterado(s), gates ${ok ? "OK" : "REPROVADOS"}`
          : `[${phase}] validadores da spec inteira: gates ${ok ? "OK" : "REPROVADOS"}`
      );
      if (!ok) {
        for (const e of outcome.errors.slice(0, 8)) console.log(`    · ${e}`);
        if (usaImplementador && changed === 0 && fs.existsSync(logPath)) {
          const tail = fs.readFileSync(logPath, "utf-8").trim().slice(-400);
          console.log(`    (nenhum arquivo alterado — fim do log da sessão: ${tail || "vazio"})`);
        }
        feedback =
          `A tentativa anterior desta mesma fase reprovou nos gates automáticos. Erros:\n` +
          outcome.errors.map((e) => `- ${e}`).join("\n") +
          `\nCorrija exatamente isso. A evidência completa está em ${outcome.evidence_path}.`;
      }
    }

    summary.push({ phase, attempts: attempt, ok, changed });
    if (!ok) {
      console.log(`\n=== autorun ${key} INTERROMPIDO na fase ${phase.toUpperCase()} ===`);
      console.log(`Evidência: ${path.relative(REPO_ROOT, evidencePathFor(packetPath))}`);
      console.log(`Logs do implementador: ${logDir}/${phase}-*.log`);
      console.log(`Worktree (intacto, nada mergeado): ${run.worktree}`);
      console.log(
        `Para retomar depois de corrigir: ${CLI} autorun ${packetArg}`
      );
      process.exit(1);
    }
  }

  const total = ((Date.now() - started) / 1000 / 60).toFixed(1);
  console.log(`\n=== autorun ${key}: três fases em ready_for_review (${total} min) ===`);
  for (const s of summary) {
    console.log(`  ${s.phase.padEnd(6)} ${s.attempts} tentativa(s), ${s.changed} arquivo(s)`);
  }

  const run = loadActiveRun(key);
  if (!run) {
    console.log("Nada a mergear (execução já encerrada anteriormente).");
    return;
  }
  console.log(`\nDiff da spec (${run.branch}):`);
  console.log(gitOut(["diff", "--stat", `${gitOut(["merge-base", currentBranch(), run.branch]) || currentBranch()}...${run.branch}`]));

  if (noMerge) {
    console.log(
      `\n--no-merge: branch ${run.branch} e worktree ${run.worktree} preservados. ` +
        `Revise (references/verify.md) e depois rode: ${CLI} merge-spec ${packetArg}`
    );
    return;
  }
  mergeSpecBranch(key, run);
}

function cmdMergeSpec(args: string[]): void {
  if (!args.length) die("uso: merge-spec <SDD-NN.yaml>");
  const { key, byPhase } = expandUnified(args[0]);
  for (const phase of PHASES) {
    const evPath = evidencePathFor(byPhase[phase]);
    if (!fs.existsSync(evPath)) die(`fase ${phase} sem evidência — rode autorun antes.`);
    const ev = JSON.parse(fs.readFileSync(evPath, "utf-8")) as { status?: string };
    if (ev.status !== "ready_for_review") die(`fase ${phase} com status '${ev.status}' — só mergeio com ready_for_review.`);
  }
  const run = loadActiveRun(key);
  if (!run) die("não há execução ativa para esta spec — provavelmente já foi mergeada.");
  mergeSpecBranch(key, run);
}


// --------------------------------------------------------------------------- deteccao de perfil

// O init-repo não deve devolver um template cheio de TODO para um humano preencher: o que dá para
// inferir do repositório (runner de teste, linter, escopos, extensões) é inferido aqui, de forma
// determinística, e o que sobra vira uma lista de pendências explícitas — que o `doctor` recusa
// enquanto não estiverem resolvidas.

interface Deteccao {
  linguagem: string;
  source_extensions: string[];
  test_markers: string[];
  test_command_template: string | null;
  lint: string | null;
  scopes: Record<string, { paths: string[] }>;
  copy_paths: string[];
  crap: { enabled: boolean; runtime?: "python" | "node"; tool?: string; coverage_command?: string };
  cognitive_loop_dir: string | null;
  pendencias: string[];
  notas: string[];
}

const IGNORAR_DIR = new Set([
  ".git", ".github", ".claude", ".specs", ".venv", "venv", "node_modules", "__pycache__",
  "dist", "build", "htmlcov", "docs", "scripts", "notebooks", "migrations", "infra",
  ".pytest_cache", ".ruff_cache", ".mypy_cache", ".idea", ".vscode",
]);

function repoTem(rel: string): boolean {
  return fs.existsSync(path.join(REPO_ROOT, rel));
}

function temBinario(bin: string): boolean {
  return runCmd(`command -v ${bin}`, REPO_ROOT, 10_000).code === 0;
}

function pythonImporta(mod: string): boolean {
  return runCmd(`python -c "import ${mod}"`, REPO_ROOT, 30_000).code === 0;
}

function nodeModuloResolvivel(mod: string): boolean {
  // runCmd roda via `/bin/bash -c`, então o argumento de -e já vai entre aspas duplas do shell —
  // JSON.stringify(mod) aninharia aspas duplas dentro de aspas duplas e quebraria o parsing.
  // Aspas simples na literal JS passam ilesas por dentro de aspas duplas do bash.
  return runCmd(`node -e "require.resolve('${mod}')"`, REPO_ROOT, 30_000).code === 0;
}

function subdiretorios(rel: string): string[] {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith(".") && !IGNORAR_DIR.has(d.name))
    .map((d) => d.name);
}

function temArquivoComExtensao(rel: string, exts: string[], profundidade = 3): boolean {
  const abs = path.join(REPO_ROOT, rel);
  if (!fs.existsSync(abs)) return false;
  const pilha: Array<[string, number]> = [[abs, 0]];
  while (pilha.length) {
    const [dir, nivel] = pilha.pop()!;
    let entradas: fs.Dirent[];
    try {
      entradas = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entradas) {
      if (e.isFile() && exts.some((x) => e.name.endsWith(x))) return true;
      if (e.isDirectory() && nivel < profundidade && !IGNORAR_DIR.has(e.name) && !e.name.startsWith(".")) {
        pilha.push([path.join(dir, e.name), nivel + 1]);
      }
    }
  }
  return false;
}

function detectaLinguagem(): string {
  if (repoTem("pyproject.toml") || repoTem("pytest.ini") || repoTem("setup.py") || repoTem("setup.cfg")) return "python";
  if (repoTem("package.json")) return "node";
  if (repoTem("go.mod")) return "go";
  if (temArquivoComExtensao(".", [".py"], 2)) return "python";
  if (temArquivoComExtensao(".", [".ts", ".tsx", ".js"], 2)) return "node";
  return "desconhecida";
}

// Diretório raiz do código: o primeiro candidato que existe e tem código dentro.
function raizDeCodigo(exts: string[]): string | null {
  for (const c of ["app", "src", "lib", "apps", "packages", "services"]) {
    if (repoTem(c) && temArquivoComExtensao(c, exts)) return c;
  }
  return null;
}

function diretorioDeTestesRaiz(): string | null {
  for (const c of ["tests", "test", "__tests__"]) if (repoTem(c)) return `${c}/`;
  return null;
}

// Escopos = subdiretórios de um contêiner de domínios. Uma spec toca um escopo, então a granularidade
// certa é "domínio", não "repo". Sem contêiner reconhecível, devolve um escopo só e registra pendência.
function detectaScopes(exts: string[], pendencias: string[]): Record<string, { paths: string[] }> {
  const testesRaiz = diretorioDeTestesRaiz();
  const conteineres = ["app/plataformas", "app/domains", "src/domains", "src/modules", "apps", "packages", "services", "src", "app"];
  for (const cont of conteineres) {
    if (!repoTem(cont)) continue;
    const filhos = subdiretorios(cont).filter((f) => temArquivoComExtensao(`${cont}/${f}`, exts));
    if (filhos.length >= 2) {
      const scopes: Record<string, { paths: string[] }> = {};
      for (const f of filhos) {
        const paths = [`${cont}/${f}/`];
        if (testesRaiz && !repoTem(`${cont}/${f}/tests`)) paths.push(testesRaiz);
        scopes[f] = { paths };
      }
      return scopes;
    }
  }
  const raiz = raizDeCodigo(exts);
  const nome = path.basename(REPO_ROOT).replace(/[^a-zA-Z0-9_]/g, "_");
  pendencias.push(
    "scopes: não achei um contêiner de domínios (app/plataformas, src/modules, packages...) — " +
      `gerei um escopo único '${nome}'. Divida em escopos reais se o repo tiver domínios separados: ` +
      "uma spec toca UM escopo, e é isso que impede uma spec de atravessar domínios."
  );
  const paths = [raiz ? `${raiz}/` : "./"];
  if (testesRaiz) paths.push(testesRaiz);
  return { [nome]: { paths } };
}

function detectaTestCommand(linguagem: string, pendencias: string[]): string | null {
  if (linguagem === "python") {
    let flags = "-q -p no:cacheprovider";
    for (const f of ["pytest.ini", "pyproject.toml", "setup.cfg", "tox.ini"]) {
      if (!repoTem(f)) continue;
      const txt = fs.readFileSync(path.join(REPO_ROOT, f), "utf-8");
      if (/addopts[^\n]*--cov/.test(txt)) flags += " --no-cov";
      if (/markers\s*=/.test(txt) && /llm_integration/.test(txt)) flags += ' -m "not llm_integration"';
      break;
    }
    return `pytest ${flags} {test_paths}`.replace(/\s+/g, " ").replace(" {test_paths}", " {test_paths}");
  }
  if (linguagem === "node") {
    const pkgPath = path.join(REPO_ROOT, "package.json");
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { scripts?: Record<string, string> };
      const script = pkg.scripts?.test;
      if (script) {
        if (/vitest/.test(script)) return "npx vitest run {test_paths}";
        if (/jest/.test(script)) return "npx jest {test_paths}";
        return "npm test -- {test_paths}";
      }
    }
    pendencias.push("scaffold.test_command_template: package.json sem script 'test' — declare o comando de teste.");
    return null;
  }
  if (linguagem === "go") return "go test {test_paths}";
  pendencias.push("scaffold.test_command_template: stack não reconhecida — declare o comando de teste do repo ({test_paths}).");
  return null;
}

function detectaLint(linguagem: string, pendencias: string[]): string | null {
  if (linguagem === "python") {
    if (temBinario("ruff")) return "ruff check {files}";
    if (temBinario("flake8")) return "flake8 {files}";
    pendencias.push("validators.lint: nenhum linter Python encontrado no PATH (ruff/flake8) — declare o do repo ou deixe null.");
    return null;
  }
  if (linguagem === "node") {
    if (repoTem(".eslintrc") || repoTem(".eslintrc.json") || repoTem("eslint.config.js") || repoTem("eslint.config.mjs")) {
      return "npx eslint {files}";
    }
    pendencias.push("validators.lint: nenhuma config de eslint encontrada — declare o linter do repo ou deixe null.");
    return null;
  }
  if (linguagem === "go") return "go vet {files}";
  return null;
}

// Chute informado do comando de cobertura Node — como o de Python, é ponto de revisão humana
// (ver ressalva no README). Prioriza o runner já declarado em package.json; sem nenhum dos três,
// não adivinha um comando que provavelmente erra.
// Sinal primário: o PROJECT_MAP.md do repo (gerado pela skill project-map) já registra o
// framework de teste com evidência real — "## 6. Testes § Comando exato" — em vez de suposição.
// Reaproveitar isso evita redetectar às cegas o que já foi verificado por outra skill.
function testRunnerFromProjectMap(): "vitest" | "jest" | "nyc" | "c8" | null {
  const mapPath = path.join(REPO_ROOT, "PROJECT_MAP.md");
  if (!fs.existsSync(mapPath)) return null;
  let content: string;
  try {
    content = fs.readFileSync(mapPath, "utf-8");
  } catch {
    return null;
  }
  const secao = content.split(/^## \d+\.\s+/m).find((s) => /^Testes\b/.test(s));
  if (!secao) return null;
  for (const runner of ["vitest", "jest", "nyc", "c8"] as const) {
    if (new RegExp(`\\b${runner}\\b`, "i").test(secao)) return runner;
  }
  return null;
}

// {coverage_json} aqui é sempre um DIRETÓRIO (ver runCrapForFeature): vitest/jest/nyc só deixam
// escolher onde escrever o relatório, não o nome do arquivo — o reporter Istanbul sempre grava
// coverage-final.json dentro do diretório indicado.
function coverageCommandFor(runner: "vitest" | "jest" | "nyc" | "c8"): string {
  switch (runner) {
    case "vitest":
      return "npx vitest run --coverage --coverage.provider=istanbul --coverage.reporter=json --coverage.reportsDirectory={coverage_json} {test_targets}";
    case "jest":
      return "npx jest --coverage --coverageReporters=json --coverageDirectory={coverage_json} {test_targets}";
    case "nyc":
    case "c8":
      return "npx nyc --reporter=json --report-dir={coverage_json} -- <comando de teste do repo> {test_targets}";
  }
}

function detectaCoverageCommandNode(): string | null {
  const runnerFromMap = testRunnerFromProjectMap();
  if (runnerFromMap) return coverageCommandFor(runnerFromMap);

  // Sem PROJECT_MAP.md, ou sem menção a um runner conhecido nele: cai para o que
  // package.json declara (sinal mais fraco — presença de dependência, não uso confirmado).
  const pkgPath = path.join(REPO_ROOT, "package.json");
  if (!fs.existsSync(pkgPath)) return null;
  let pkg: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  } catch {
    return null;
  }
  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (deps.vitest) return coverageCommandFor("vitest");
  if (deps.jest) return coverageCommandFor("jest");
  if (deps.nyc || deps.c8) return coverageCommandFor("nyc");
  return null;
}

function detectaPerfil(): Deteccao {
  const pendencias: string[] = [];
  const notas: string[] = [];
  const linguagem = detectaLinguagem();
  const exts =
    linguagem === "python" ? [".py"] : linguagem === "node" ? [".ts", ".tsx", ".js", ".jsx"] : linguagem === "go" ? [".go"] : [".py"];
  const markers =
    linguagem === "node"
      ? ["/tests/", "/__tests__/", ".test.", ".spec.", "fixtures"]
      : linguagem === "go"
        ? ["_test.go", "/testdata/"]
        : ["/tests/", "/test_", "test_", "conftest.py", "fixtures"];

  // Instalado como plugin, o hook vale em qualquer diretório e o worktree não precisa da cópia do
  // settings.json; sem plugin, ela é o que faz o enforcement existir lá dentro.
  const copyPaths = !PLUGIN_ROOT || repoTem(".claude/settings.json") ? [".claude/settings.json"] : [];
  for (const f of [".env", ".env.test", ".env.local"]) if (repoTem(f)) copyPaths.push(f);

  const raiz = raizDeCodigo(exts) ?? ".";
  const pythonCrapOk = linguagem === "python" && pythonImporta("radon") && pythonImporta("pytest_cov");
  const nodeCoverageCommand = linguagem === "node" ? detectaCoverageCommandNode() : null;
  const nodeCrapOk = linguagem === "node" && !!nodeCoverageCommand && nodeModuloResolvivel("eslintcc");

  let crap: { enabled: boolean; runtime?: "python" | "node"; tool?: string; coverage_command?: string };
  if (pythonCrapOk) {
    crap = {
      enabled: true,
      coverage_command:
        `pytest -q -p no:cacheprovider --cov=${raiz} --cov-report=json:{coverage_json} ` +
        "--cov-fail-under=0 {test_targets}",
    };
  } else if (nodeCrapOk) {
    crap = {
      enabled: true,
      runtime: "node",
      tool: "tools/crap_calculator.ts",
      coverage_command: nodeCoverageCommand!,
    };
  } else {
    crap = { enabled: false };
  }
  if (!crap.enabled) {
    if (linguagem === "python") {
      notas.push(
        "crap: desligado — a etapa exige Python com `radon` e `pytest-cov` no ambiente. Ligue com " +
          "enabled=true depois de instalá-los; o resto do harness não depende dela."
      );
    } else if (linguagem === "node") {
      const falta: string[] = [];
      if (!nodeCoverageCommand) falta.push("nenhum runner de teste conhecido (vitest/jest/nyc/c8) em package.json");
      if (!nodeModuloResolvivel("eslintcc")) falta.push("`eslintcc` não resolvível (instale como devDependency)");
      notas.push(
        `crap: desligado — ${falta.join("; ")}. Ligue com enabled=true, runtime="node", ` +
          "tool=\"tools/crap_calculator.ts\" depois de resolver; o resto do harness não depende dela."
      );
    } else {
      notas.push(
        "crap: desligado — sem detector para esta linguagem. Ligue manualmente se houver um " +
          "equivalente a radon/eslintcc disponível; o resto do harness não depende dela."
      );
    }
  }

  const candidatosCL = [
    process.env.COGNITIVE_LOOP_DIR,
    path.join(os.homedir(), "repositorios", "cognitive-loop"),
    path.join(os.homedir(), "cognitive-loop"),
  ].filter((c): c is string => !!c);
  const cognitiveLoopDir = candidatosCL.find((c) => fs.existsSync(c)) ?? null;

  return {
    linguagem,
    source_extensions: exts,
    test_markers: markers,
    test_command_template: detectaTestCommand(linguagem, pendencias),
    lint: detectaLint(linguagem, pendencias),
    scopes: detectaScopes(exts, pendencias),
    copy_paths: copyPaths,
    crap,
    cognitive_loop_dir: cognitiveLoopDir,
    pendencias,
    notas,
  };
}

// --------------------------------------------------------------------------- init-repo

// O motor é global (um clone em ~/.claude/spec_harness serve todos os repos); a config é sempre
// do repositório, porque escopos, validadores e comando de teste são dele. Este comando cria a
// config a partir do template e registra o hook de path scoping, que é o resto da instalação.

// A guarda em bash sai em ~3ms quando não há spec ativa; sem ela, cada tool call do repositório
// pagaria os ~370ms de node + type stripping só para descobrir que não há nada a checar.
const HOOK_GUARD = path.join(HARNESS_DIR, "hook-guard.sh");
const HOOK_COMMAND = `"${HOOK_GUARD.startsWith(os.homedir()) ? HOOK_GUARD.replace(os.homedir(), "$HOME") : HOOK_GUARD}"`;

function ensurePreToolUseHook(settingsPath: string): "criado" | "atualizado" | "já presente" {
  interface HookEntry {
    type?: string;
    command?: string;
    timeout?: number;
  }
  interface Matcher {
    matcher?: string;
    hooks?: HookEntry[];
  }
  const settings: { hooks?: { PreToolUse?: Matcher[] } } = fs.existsSync(settingsPath)
    ? (JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as { hooks?: { PreToolUse?: Matcher[] } })
    : {};
  settings.hooks ??= {};
  settings.hooks.PreToolUse ??= [];

  const existing = settings.hooks.PreToolUse.flatMap((m) => m.hooks ?? []).find((h) =>
    /spec_harness\/(harness\.ts|hook-guard\.sh)/.test(h.command ?? "")
  );
  if (existing) {
    if (existing.command === HOOK_COMMAND) return "já presente";
    existing.command = HOOK_COMMAND;
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
    return "atualizado";
  }

  settings.hooks.PreToolUse.push({
    matcher: "*",
    hooks: [{ type: "command", command: HOOK_COMMAND, timeout: 15 }],
  });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n", "utf-8");
  return "criado";
}

type PerfilJson = Record<string, unknown>;

// Aplica a detecção sobre o template. Só o que foi realmente inferido é escrito; o resto fica como
// veio do template, e as pendências viram `_pendencias` no próprio arquivo — visível para quem
// (humano ou agente) for terminar a configuração.
function aplicaDeteccao(perfil: PerfilJson, d: Deteccao): PerfilJson {
  const out: PerfilJson = { ...perfil };
  out._detectado = {
    em: new Date().toISOString(),
    linguagem: d.linguagem,
    motor: SELF,
  };
  if (d.pendencias.length) out._pendencias = d.pendencias;
  else delete out._pendencias;
  if (d.notas.length) out._notas = d.notas;
  else delete out._notas;

  const scaffold = { ...((out.scaffold as PerfilJson) ?? {}) };
  if (d.test_command_template) scaffold.test_command_template = d.test_command_template;
  out.scaffold = scaffold;

  out.scopes = { ...d.scopes };
  out.source_extensions = d.source_extensions;
  out.test_markers = { ...((out.test_markers as PerfilJson) ?? {}), patterns: d.test_markers };

  const validators = { ...((out.validators as PerfilJson) ?? {}) };
  validators.lint = d.lint ? { id: "global_lint", run: d.lint } : null;
  out.validators = validators;

  out.worktree = { ...((out.worktree as PerfilJson) ?? {}), link_paths: [], copy_paths: d.copy_paths };

  const crap = { ...((out.crap as PerfilJson) ?? {}) };
  crap.enabled = d.crap.enabled;
  if (d.crap.coverage_command) crap.coverage_command = d.crap.coverage_command;
  if (d.crap.runtime) crap.runtime = d.crap.runtime;
  if (d.crap.tool) crap.tool = d.crap.tool;
  out.crap = crap;

  const postVerify = { ...((out.post_verify as PerfilJson) ?? {}) };
  const jobs = ((postVerify.jobs as Array<Record<string, unknown>>) ?? []).filter((j) => {
    if (j.id !== "cognitive_loop") return true;
    if (!d.cognitive_loop_dir) return false;
    j.add_dirs = [d.cognitive_loop_dir];
    j.plugin_dirs = [d.cognitive_loop_dir];
    delete j._comment;
    return true;
  });
  postVerify.jobs = jobs;
  out.post_verify = postVerify;

  return out;
}

function cmdInitRepo(args: string[]): void {
  const force = args.includes("--force");
  const template = path.join(HARNESS_DIR, "templates", "harness.config.template.json");
  if (!fs.existsSync(template)) die(`template não encontrado: ${template}`);

  const destDir = path.join(REPO_ROOT, ".claude", "spec_harness");
  const dest = path.join(destDir, "harness.config.json");
  const jaExiste = fs.existsSync(dest);

  if (jaExiste && !force) {
    console.log(`Config já existe: ${path.relative(REPO_ROOT, dest)} (use --force para regerar a partir da detecção).`);
  } else {
    console.log("Detectando o perfil do repositório...");
    const d = detectaPerfil();
    const perfil = aplicaDeteccao(JSON.parse(fs.readFileSync(template, "utf-8")) as PerfilJson, d);
    fs.mkdirSync(destDir, { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(perfil, null, 2) + "\n", "utf-8");
    console.log(`Config ${jaExiste ? "regerada" : "criada"}: ${path.relative(REPO_ROOT, dest)}`);
    console.log(`  linguagem: ${d.linguagem}`);
    console.log(`  escopos: ${Object.keys(d.scopes).join(", ")}`);
    console.log(`  teste: ${d.test_command_template ?? "NÃO DETECTADO"}`);
    console.log(`  lint: ${d.lint ?? "nenhum"}`);
    console.log(`  crap: ${d.crap.enabled ? "ligado" : "desligado"}`);
    console.log(
      d.cognitive_loop_dir
        ? `  cognitive_loop: plugin encontrado em ${d.cognitive_loop_dir} (job não vem no template padrão — adicione-o de volta a post_verify.jobs se quiser usá-lo)`
        : "  cognitive_loop: não faz parte do template padrão (ver SKILL.md § Revisão automática)"
    );
  }

  if (PLUGIN_ROOT && !args.includes("--hook")) {
    console.log(
      "Hook PreToolUse: fornecido pelo plugin (hooks/hooks.json) — nada a registrar neste repo. " +
        "Use --hook para registrar mesmo assim."
    );
  } else {
    const settingsPath = path.join(REPO_ROOT, ".claude", "settings.json");
    const hookStatus = ensurePreToolUseHook(settingsPath);
    console.log(`Hook PreToolUse: ${hookStatus} em .claude/settings.json`);
  }

  console.log("");
  const problemas = diagnostico();
  imprimeDiagnostico(problemas);
  if (problemas.some((x) => x.nivel === "ERRO")) {
    console.log(
      `\nCorrija os ERROs na config e rode \`${CLI} doctor\` até sair limpo. ` +
        "A detecção é um chute informado, não um oráculo: escopos e comando de teste merecem revisão."
    );
    process.exit(1);
  }
  console.log(`\nConfig utilizável. Próximo passo: ${CLI} scaffold-packet .specs/sdd-<feature>/specs/NN-<spec>.md`);
}

// --------------------------------------------------------------------------- doctor

interface Problema {
  nivel: "ERRO" | "AVISO";
  campo: string;
  msg: string;
}

// `npx <pkg>` resolve o pacote em node_modules/.bin, que não está no PATH da sessão: o que
// precisa existir é o npx.
function binarioDoComando(cmd: string): string {
  return cmd.trim().split(/\s+/)[0];
}

// Diagnóstico do perfil do repo: o que impede uma spec de rodar (ERRO) e o que apenas degrada
// (AVISO). É a lista fechada que um agente pode usar para terminar a configuração sozinho.
function diagnostico(): Problema[] {
  const problemas: Problema[] = [];
  const add = (nivel: "ERRO" | "AVISO", campo: string, msg: string) => problemas.push({ nivel, campo, msg });

  if (!fs.existsSync(CONFIG_PATH)) {
    add("ERRO", "config", `config não encontrada em ${CONFIG_PATH} — rode \`${CLI} init-repo\`.`);
    return problemas;
  }

  let cfg: HarnessConfig & Record<string, unknown>;
  try {
    cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8")) as HarnessConfig & Record<string, unknown>;
  } catch (err) {
    add("ERRO", "config", `JSON inválido: ${String(err)}`);
    return problemas;
  }

  for (const p of (cfg._pendencias as string[]) ?? []) {
    add("ERRO", "_pendencias", `${p} Depois de resolver, apague a entrada de _pendencias.`);
  }
  for (const n of (cfg._notas as string[]) ?? []) add("AVISO", "_notas", n);

  const scopes = realKeys(cfg.scopes as Record<string, unknown>);
  if (!scopes.length) add("ERRO", "scopes", "nenhum escopo declarado — o path scoping não tem o que aplicar.");
  for (const nome of scopes) {
    if (nome.startsWith("TODO")) add("ERRO", "scopes", `escopo '${nome}' ainda é placeholder do template.`);
    const paths = (cfg.scopes?.[nome] as { paths?: string[] })?.paths ?? [];
    if (!paths.length) add("ERRO", `scopes.${nome}`, "sem 'paths'.");
    for (const rel of paths) {
      if (!repoTem(rel)) add("ERRO", `scopes.${nome}`, `path inexistente no repo: ${rel}`);
    }
  }

  if (!(cfg.source_extensions ?? []).length) add("ERRO", "source_extensions", "vazio — nenhum arquivo seria validado.");
  if (!(cfg.test_markers?.patterns ?? []).length) {
    add("ERRO", "test_markers.patterns", "vazio — o harness não distinguiria teste de produção nos gates de RED/GREEN.");
  }

  const tmpl = (cfg.scaffold as { test_command_template?: string } | undefined)?.test_command_template;
  if (!tmpl) {
    add("AVISO", "scaffold.test_command_template", "ausente — o scaffold usará o default pytest.");
  } else if (!tmpl.includes("{test_paths}")) {
    add("ERRO", "scaffold.test_command_template", "não contém {test_paths} — o comando ignoraria os testes da spec.");
  } else if (!temBinario(binarioDoComando(tmpl))) {
    add("ERRO", "scaffold.test_command_template", `binário '${binarioDoComando(tmpl)}' não está no PATH desta sessão.`);
  }

  const validadores = globalValidators();
  if (!validadores.length) add("AVISO", "validators", "nenhum validador ligado — nenhum lint roda nos arquivos alterados.");
  for (const v of validadores) {
    if (!v.run?.includes("{files}")) add("ERRO", `validators.${v.id}`, "não contém {files}.");
    else if (!temBinario(binarioDoComando(v.run))) {
      add("ERRO", `validators.${v.id}`, `binário '${binarioDoComando(v.run)}' não está no PATH desta sessão.`);
    }
  }

  const copyPaths = cfg.worktree?.copy_paths ?? [];
  if (!copyPaths.includes(".claude/settings.json")) {
    if (PLUGIN_ROOT) {
      add("AVISO", "worktree.copy_paths", "sem '.claude/settings.json' — ok: o hook vem do plugin e vale em qualquer diretório, inclusive no worktree.");
    } else {
      add("ERRO", "worktree.copy_paths", "sem '.claude/settings.json' — o hook não roda dentro do worktree e a spec fica sem enforcement de path.");
    }
  }
  for (const rel of copyPaths) {
    if (!repoTem(rel)) add("AVISO", "worktree.copy_paths", `'${rel}' não existe no repo (será ignorado na cópia).`);
  }

  const settingsPath = path.join(REPO_ROOT, ".claude", "settings.json");
  if (PLUGIN_ROOT && !fs.existsSync(settingsPath)) {
    // Hook do plugin vale em toda sessão; o repo não precisa declarar nada.
  } else if (!fs.existsSync(settingsPath)) {
    add("ERRO", "hook", `.claude/settings.json não existe — rode \`${CLI} init-repo\`.`);
  } else {
    const txt = fs.readFileSync(settingsPath, "utf-8");
    if (!/(spec_harness|spec-harness)\/(engine\/)?(harness\.ts|hook-guard\.sh)/.test(txt)) {
      if (!PLUGIN_ROOT) add("ERRO", "hook", "PreToolUse do harness não registrado em .claude/settings.json.");
    } else if (txt.includes("harness.ts") && !txt.includes("hook-check")) {
      add("ERRO", "hook", "hook aponta para o harness sem o subcomando hook-check.");
    } else if (txt.includes("hook-guard.sh") && !fs.existsSync(HOOK_GUARD)) {
      add("ERRO", "hook", `guarda do hook não encontrada: ${HOOK_GUARD}`);
    }
  }

  const crap = cfg.crap ?? {};
  if (crap.enabled) {
    const tool = crap.tool ? resolveEnginePath(crap.tool) : null;
    if (!tool || !fs.existsSync(tool)) add("ERRO", "crap.tool", `ferramenta não encontrada: ${crap.tool ?? "(vazio)"}`);
    const cov = crap.coverage_command ?? "";
    for (const marca of ["{coverage_json}", "{test_targets}"]) {
      if (!cov.includes(marca)) add("ERRO", "crap.coverage_command", `não contém ${marca}.`);
    }
    if ((crap.runtime ?? "node") === "python") {
      if (!pythonImporta("radon")) add("ERRO", "crap", "`radon` não importável — instale-o ou desligue crap.enabled.");
      if (!pythonImporta("pytest_cov")) add("ERRO", "crap", "`pytest-cov` não importável — instale-o ou desligue crap.enabled.");
    } else {
      if (!nodeModuloResolvivel("eslintcc")) {
        add("ERRO", "crap", "`eslintcc` não resolvível — instale-o (devDependency) ou desligue crap.enabled.");
      }
    }
  }

  const pv = cfg.post_verify ?? {};
  if (pv.enabled) {
    if (!temBinario("claude")) add("ERRO", "post_verify", "CLI `claude` não está no PATH — os jobs de revisão não rodariam.");
    for (const job of pv.jobs ?? []) {
      if (!job.prompt) add("ERRO", `post_verify.${job.id}`, "job sem prompt.");
      for (const d of [...(job.add_dirs ?? []), ...(job.plugin_dirs ?? [])]) {
        if (!fs.existsSync(d)) add("ERRO", `post_verify.${job.id}`, `diretório declarado não existe: ${d}`);
      }
    }
  }

  const impl = (cfg as { implementer?: { prompts?: Record<string, string> } }).implementer;
  for (const fase of ["red", "green"]) {
    if (!impl?.prompts?.[fase]) add("ERRO", `implementer.prompts.${fase}`, "ausente — o autorun não teria o que mandar para a sessão da fase.");
  }

  return problemas;
}

function imprimeDiagnostico(problemas: Problema[]): void {
  const erros = problemas.filter((p) => p.nivel === "ERRO");
  const avisos = problemas.filter((p) => p.nivel === "AVISO");
  if (!problemas.length) {
    console.log("doctor: OK — perfil completo e utilizável neste repositório.");
    return;
  }
  for (const p of erros) console.log(`  ERRO  [${p.campo}] ${p.msg}`);
  for (const p of avisos) console.log(`  AVISO [${p.campo}] ${p.msg}`);
  console.log(`\ndoctor: ${erros.length} erro(s), ${avisos.length} aviso(s) — arquivo: ${path.relative(REPO_ROOT, CONFIG_PATH)}`);
}

function cmdDoctor(args: string[]): void {
  const problemas = diagnostico();
  if (args.includes("--json")) {
    console.log(JSON.stringify({ config: CONFIG_PATH, problemas }, null, 2));
  } else {
    imprimeDiagnostico(problemas);
  }
  if (problemas.some((p) => p.nivel === "ERRO")) process.exit(1);
}

// --------------------------------------------------------------------------- main

async function main(): Promise<void> {
  ensureDirs();
  const argv = process.argv.slice(2);
  if (!argv.length) {
    console.log(USAGE);
    process.exit(1);
  }

  const [command, ...rest] = argv;

  if (command === "hook-check") {
    cmdHookCheck();
    return;
  }

  const dispatch: Record<string, (args: string[]) => void | Promise<void>> = {
    "init-repo": cmdInitRepo,
    doctor: cmdDoctor,
    "validate-spec": cmdValidateSpec,
    "validate-packet": cmdValidatePacket,
    "open-packet": cmdOpenPacket,
    "verify-packet": cmdVerifyPacket,
    "scaffold-packet": cmdScaffoldPacket,
    "expand-packet": cmdExpandPacket,
    autorun: cmdAutorun,
    "merge-spec": cmdMergeSpec,
    "run-spec": cmdRunSpec,
    "run-parallel": cmdRunParallel,
    "post-verify": cmdPostVerify,
    "review-feature": cmdReviewFeature,
    "discard-spec-worktree": cmdDiscardSpecWorktree,
  };

  const fn = dispatch[command];
  if (!fn) die(`comando desconhecido: ${command}\n\n${USAGE}`);
  await fn(rest);
}

main().catch((err) => die(String(err)));
