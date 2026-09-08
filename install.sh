#!/usr/bin/env bash
# Instala (via link simbólico) as skills e o motor deste repositório em ~/.claude,
# tornando-os disponíveis globalmente para o Claude Code em qualquer projeto.
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

install_link() {
  local source="$1" target="$2" label="$3"
  mkdir -p "$(dirname "$target")"

  if [ -L "$target" ] && [ "$(readlink "$target")" = "$source" ]; then
    echo "OK (já instalada) - $label"
    return
  fi

  if [ -e "$target" ] || [ -L "$target" ]; then
    echo "Substituindo instalação existente de '$label'..."
    rm -rf "$target"
  fi

  ln -s "$source" "$target"
  echo "Link criado  - $label"
}

# Skills -> ~/.claude/skills/<nome>
skills_dir="$repo_dir/skills"
global_skills_dir="$HOME/.claude/skills"
for skill_path in "$skills_dir"/*/; do
  skill_name="$(basename "$skill_path")"
  install_link "${skill_path%/}" "$global_skills_dir/$skill_name" "$skill_name"
done

# Motor do spec-harness -> ~/.claude/spec_harness
engine_dir="$repo_dir/spec_harness"
if [ -d "$engine_dir" ]; then
  install_link "$engine_dir" "$HOME/.claude/spec_harness" "spec_harness (motor)"
fi

echo ""
echo "Instalado em: $global_skills_dir e $HOME/.claude/spec_harness"
