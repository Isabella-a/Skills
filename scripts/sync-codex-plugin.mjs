import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(repositoryRoot, "skills");
const pluginRoot = path.join(repositoryRoot, ".agents", "plugins", "plugins", "isabella");
const destination = path.join(pluginRoot, "skills");
const manifestPath = path.join(pluginRoot, ".codex-plugin", "plugin.json");

if (!fs.existsSync(source) || !fs.existsSync(manifestPath)) {
  throw new Error("Codex plugin source or manifest is missing.");
}

fs.rmSync(destination, { recursive: true, force: true });
fs.mkdirSync(destination, { recursive: true });

for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
  if (entry.isDirectory()) {
    fs.cpSync(path.join(source, entry.name), path.join(destination, entry.name), { recursive: true });
  }
}

if (process.argv.includes("--cachebuster")) {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const baseVersion = String(manifest.version).split("+", 1)[0];
  const timestamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  manifest.version = `${baseVersion}+codex.${timestamp}`;
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

console.log(`Codex plugin synchronized: ${path.relative(repositoryRoot, destination)}`);
