#!/usr/bin/env bash
# Instala (via link simbólico) as skills deste repositório em ~/.claude/skills,
# tornando-as disponíveis globalmente para o Claude Code em qualquer projeto.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skills_dir="$repo_dir/skills"
global_dir="$HOME/.claude/skills"

mkdir -p "$global_dir"

for skill_path in "$skills_dir"/*/; do
  skill_name="$(basename "$skill_path")"
  target="$global_dir/$skill_name"
  source="${skill_path%/}"

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
    echo "OK (já instalada) - $skill_name"
    continue
  fi

  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "Substituindo instalação existente de '$skill_name'..."
    rm -rf "$target"
  fi

  ln -s "$source" "$target"
  echo "Link criado  - $skill_name"
done

echo ""
echo "Skills instaladas em: $global_dir"
