# claude-skills

Repositório com skills genéricas do Claude Code, para instalar globalmente
(`~/.claude/skills`) e usar em **qualquer** repositório — não apenas em um
projeto específico.

Skills que dependiam de convenções ou código de um monorepo específico (ex.:
integrações Jira/GitHub, code review com stack fixa, migração de banco em
andamento) **não** entram aqui — ficam melhor como skills de projeto, dentro
do `.claude/skills` de cada repo. Este repositório é só para referências e
guias reaproveitáveis em qualquer contexto.

## Skills incluídas

### `nestjs-modular-monolith`
Referência para desenhar módulos NestJS como monolito modular (DDD, Clean
Architecture, CQRS). Útil como consulta de padrões ao criar bounded contexts,
módulos de domínio ou comunicação orientada a eventos entre módulos.

### `react-best-practices`
Boas práticas de performance para React/Next.js (Vercel Engineering) — data
fetching, bundle, renderização. Ativa ao escrever, revisar ou refatorar
componentes React/Next.js.

### `monorepo-management`
Referência geral de gestão de monorepos com Turborepo, Nx e pnpm workspaces —
builds otimizados, dependências compartilhadas, estrutura de packages.

### `sdd` + `spec-harness`
Duas skills encadeadas, vindas do plugin [Spec-Harness](https://github.com/VitorMRCNeves/Spec-Harness)
(cópia local do estado de trabalho, não instalada via marketplace): `sdd`
quebra uma entrega em specs construíveis (`.specs/sdd-<feature>/`) e
`spec-harness` implementa cada uma em RED→GREEN→VERIFY dentro de um git
worktree isolado, com enforcement de path e revisão automática. São
genéricas por design — na primeira execução num repositório novo, a própria
skill escaneia o projeto e grava `.claude/sdd/perfil.md`, e o `spec-harness`
roda `init-repo`/`doctor` para gerar o `.claude/spec_harness/harness.config.json`
daquele repo.

Dependem de duas coisas fora deste repositório:
- skill `grilling` (plugin `mattpocock-skills`) — entrevista o usuário antes
  de gerar a spec.
- skill/MCP de rastreador de issues (Jira, GitHub Issues etc.), se você
  quiser resolver ticket por chave/link — opcional.

O motor (`spec_harness/`, na raiz deste repo) **não é uma skill** — é o
executável (`harness.ts` + `hook-guard.sh`) que a skill `spec-harness`
invoca. É instalado à parte, em `~/.claude/spec_harness/` (ver Instalação
abaixo), porque o texto da skill referencia esse caminho fixo. O hook de
enforcement de path em cada repo (`PreToolUse` em `.claude/settings.json`)
é escrito automaticamente pelo próprio `harness.ts init-repo` na primeira
vez que a skill for usada nesse repo — não precisa configurar à mão.

## Instalação

```powershell
.\install.ps1
```

```bash
./install.sh
```

O script cria **links simbólicos**:
- de cada pasta em `skills/` para `~/.claude/skills/<nome>` (skills
  disponíveis globalmente para o Claude Code);
- de `spec_harness/` para `~/.claude/spec_harness` (motor usado pela skill
  `spec-harness`).

Editando aqui, o efeito aparece em todos os projetos sem precisar reinstalar.

Criar link simbólico no Windows sem ser administrador exige o **Modo de
Desenvolvedor** ativado (Configurações → Sistema → Para desenvolvedores). Se
não estiver disponível, o script cai automaticamente para cópia de arquivos
(nesse caso, rode o script de novo após alterar uma skill ou o motor para
propagar a mudança).

## Adicionando uma nova skill

1. Crie a pasta em `skills/<nome-da-skill>/SKILL.md` (frontmatter com `name`
   e `description`, ver skills existentes como exemplo).
2. Rode o script de instalação de novo — ele varre `skills/*` automaticamente.
3. Garanta que a skill seja genérica: nada de nomes de projeto, URLs internas
   ou convenções específicas de um único repo. Se for específica de um
   projeto, ela pertence ao `.claude/skills` daquele repo, não aqui.
