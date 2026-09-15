#!/usr/bin/env bash
# Instala as skills deste repositório para o Codex CLI, que descobre skills em
# .agents/skills/<nome>/SKILL.md — pasta fixa e diferente da usada pelo plugin do Claude Code
# (skills/), então não dá para as duas apontarem pro mesmo diretório sem symlink (frágil no
# Windows). Este script copia em vez de symlinkar: portátil, ao custo de reinstalar depois de
# atualizar o repo (git pull && ./scripts/install-codex.sh).
#
# Uso:
#   ./scripts/install-codex.sh            # instala em ~/.agents/skills (todo repositório, como o /plugin do Claude Code)
#   ./scripts/install-codex.sh --local     # instala em ./.agents/skills (só o repositório atual)
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
dest="$HOME/.agents/skills"
[ "${1:-}" = "--local" ] && dest="$(pwd)/.agents/skills"

mkdir -p "$dest"
for skill_dir in "$repo_root"/skills/*/; do
  name="$(basename "$skill_dir")"
  rm -rf "${dest:?}/$name"
  cp -r "$skill_dir" "$dest/$name"
  echo "instalada: $name -> $dest/$name"
done

echo
echo "spec-harness precisa também do motor (spec_harness/) e do CLI \`codex\` no PATH — ver"
echo "skills/spec-harness/SKILL.md § Instalação."
