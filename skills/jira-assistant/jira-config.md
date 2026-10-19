# Jira Project Configuration

This workspace uses the following Jira configuration:

- **Project Key:** PROJ
- **Project Name:** Your Project Name
- **Cloud ID:** <cloudId>
- **URL:** https://your-site.atlassian.net
- **Board URL:** https://your-site.atlassian.net/jira/software/c/projects/PROJ/boards

## Issue types (PT-BR)

Os nomes dos tipos de issue do PROJ estão em português — use-os ao criar issues:

- **Epic**
- **História**
- **Bug**
- **Tarefa** (default)
- **Subtarefa** (requer o campo `parent` com a issue pai)

> **Template.** Valores de exemplo — não commite dados reais de empresa neste repositório público.
> Coloque a configuração real no `CLAUDE.md`/`AGENTS.md` do repositório interno (a skill também
> lê de lá). Sem config, a skill descobre `cloudId` e projetos via MCP (`getAccessibleAtlassianResources`).
