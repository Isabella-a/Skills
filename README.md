# Claude Code Skills

Coleção de [Skills](https://docs.claude.com/en/docs/claude-code/skills) genéricas para o
[Claude Code](https://claude.com/claude-code), instaladas uma única vez e disponíveis
automaticamente em **qualquer** repositório da sua máquina — sem precisar copiar nada projeto a
projeto.

Cada skill é reaproveitável por design: nenhuma delas assume convenções, nomes ou estrutura de um
projeto específico. Se você precisa de uma skill amarrada às regras de um repositório em
particular, ela deve viver no `.claude/skills/` daquele repositório, não aqui.

## Pré-requisitos

- [Claude Code](https://claude.com/claude-code) instalado.
- Git.
- Para usar as skills `sdd` / `spec-harness`: [Node.js](https://nodejs.org) recente (22.6+), com
  suporte nativo à execução de arquivos `.ts`.

## Instalação

```bash
git clone https://github.com/Isabella-a/Skills.git
cd Skills
```

**Windows (PowerShell):**

```powershell
.\install.ps1
```

**Linux / macOS / WSL (bash):**

```bash
./install.sh
```

O script cria um **link simbólico** de cada skill em `~/.claude/skills/<nome>` e, quando aplicável,
do motor do spec-harness em `~/.claude/spec_harness`. Por serem links, qualquer atualização
puxada com `git pull` neste repositório já reflete em todos os projetos, sem reinstalar nada.

No Windows, criar link simbólico sem ser administrador exige o **Modo de Desenvolvedor** ativado
(Configurações → Sistema → Para desenvolvedores). Sem ele, o script cai automaticamente para cópia
de arquivos — nesse caso, rode `.\install.ps1` de novo depois de um `git pull` para propagar
atualizações.

### Verificando a instalação

```powershell
Get-ChildItem "$HOME\.claude\skills"
```

```bash
ls ~/.claude/skills
```

Abra o Claude Code em qualquer repositório e digite `/` para ver as skills instaladas na lista de
comandos, ou simplesmente descreva a tarefa em linguagem natural — o Claude reconhece o pedido e
ativa a skill certa sozinho.

## Skills disponíveis

| Skill | O que faz | Como acionar |
|---|---|---|
| [`nestjs-modular-monolith`](skills/nestjs-modular-monolith) | Referência para desenhar módulos NestJS como monolito modular (DDD, Clean Architecture, CQRS). | Ativa ao mencionar "modular monolith", "bounded contexts", "CQRS" ou ao desenhar módulos de domínio em NestJS. |
| [`react-best-practices`](skills/react-best-practices) | Boas práticas de performance para React/Next.js (Vercel Engineering) — data fetching, bundle, renderização. | Ativa ao escrever, revisar ou refatorar componentes React/Next.js. |
| [`monorepo-management`](skills/monorepo-management) | Referência geral de gestão de monorepos com Turborepo, Nx e pnpm workspaces. | Ativa ao configurar um monorepo, otimizar builds ou gerenciar dependências compartilhadas. |
| [`sdd`](skills/sdd) | Quebra uma entrega em specs construíveis — documentos de Spec-Driven Design, um por unidade testável, antes de qualquer código. | `/sdd <descrição da feature>`, `/sdd ABC-1234` (busca o ticket antes) ou peça "escreve um spec para X". |
| [`spec-harness`](skills/spec-harness) | Implementa cada spec gerada pela `sdd` em RED→GREEN→VERIFY, num git worktree isolado, com enforcement de path e revisão automática. | Automática, depois que a pasta `.specs/sdd-<feature>/` já existir. |

### `sdd` + `spec-harness` em detalhe

Essas duas skills se encadeiam e vêm do plugin
[Spec-Harness](https://github.com/VitorMRCNeves/Spec-Harness): `sdd` produz as specs,
`spec-harness` as implementa. Na primeira execução em um repositório novo, elas se auto-configuram:

1. `sdd` escaneia o projeto (perguntando o que não conseguir inferir) e grava
   `.claude/sdd/perfil.md`.
2. `spec-harness` roda `init-repo` / `doctor` para gerar `.claude/spec_harness/harness.config.json`
   e registrar o hook de enforcement de path — nada disso precisa ser configurado manualmente.

Dependências externas a este repositório (ambas opcionais, mas usadas se disponíveis):

- skill `grilling` (plugin `mattpocock-skills`) — entrevista o usuário antes de gerar a spec.
- skill/MCP de rastreador de issues (Jira, GitHub Issues etc.) — para resolver um ticket por
  chave ou link.

## Estrutura do repositório

```text
skills/            # uma pasta por skill, com SKILL.md na raiz de cada uma
spec_harness/      # motor do spec-harness (harness.ts) — não é uma skill, instalado à parte
install.ps1        # instalação no Windows
install.sh         # instalação no Linux/macOS/WSL
```

## Atualizando

```bash
git pull
```

Como a instalação é por link simbólico, um `git pull` já é suficiente — não é preciso rodar o
script de instalação de novo, exceto quando uma skill nova for adicionada ou a instalação tiver
caído para modo cópia (ver aviso do Modo de Desenvolvedor acima).
