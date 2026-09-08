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

## Instalação

As skills do Claude Code ficam globais quando colocadas em
`~/.claude/skills/<nome-da-skill>/SKILL.md`. Os scripts abaixo criam um
**link simbólico** de cada skill deste repo para lá (edite aqui, o efeito
aparece em todos os projetos sem precisar reinstalar).

### Windows (PowerShell)

```powershell
.\install.ps1
```

Criar link simbólico no Windows sem ser administrador exige o **Modo de
Desenvolvedor** ativado (Configurações → Sistema → Para desenvolvedores). Se
não estiver disponível, o script cai automaticamente para cópia de arquivos
(nesse caso, rode o script de novo após alterar uma skill para propagar a
mudança).

### WSL / Linux / macOS (bash)

```bash
./install.sh
```

## Adicionando uma nova skill

1. Crie a pasta em `skills/<nome-da-skill>/SKILL.md` (frontmatter com `name`
   e `description`, ver skills existentes como exemplo).
2. Rode o script de instalação de novo — ele varre `skills/*` automaticamente.
3. Garanta que a skill seja genérica: nada de nomes de projeto, URLs internas
   ou convenções específicas de um único repo. Se for específica de um
   projeto, ela pertence ao `.claude/skills` daquele repo, não aqui.
