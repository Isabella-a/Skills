# Jira Assistant Skill

This skill provides expert Jira operations using Atlassian MCP tools. It automatically detects workspace Jira configuration from context or prompts for project details.

## Configuration Requirements

The skill requires the following configuration values to be available in your workspace context:

### Required Values

- **Project Key** - The Jira project key (e.g., `KAN`, `PROJ`, `DEV`)
- **Cloud ID** - Your Atlassian Cloud ID (UUID format or site URL)
- **URL** - Your Atlassian site URL (e.g., `https://example.atlassian.net/`)

### Optional Values

- **Project Name** - Human-readable project name
- **Board URL** - Link to your Jira board (optional, for convenience)

## Where to Configure

The skill detects configuration from multiple sources:

### Option 1 (recommended): Skill config file (`jira-config.md`)

Create a `jira-config.md` next to `SKILL.md` in the skill folder:

```markdown
# Jira Project Configuration

This workspace uses the following Jira configuration:

- **Project Key:** YOUR_PROJECT_KEY
- **Cloud ID:** your-cloud-id-uuid-or-url
- **URL:** https://your-site.atlassian.net/
- **Project Name:** Your Project Name (optional)
- **Board URL:** https://your-site.atlassian.net/jira/software/projects/YOUR_PROJECT_KEY/boards/1 (optional)
```

### Option 2: Other Context Sources

The skill will also detect configuration from:

- Workspace documentation files (e.g. `CLAUDE.md`, `AGENTS.md`)
- Project README files
- Any markdown files in your workspace that contain Jira configuration

### Option 3: Interactive Prompt

If no configuration is found, the skill will:

1. Use MCP tools to discover available Jira projects
2. Prompt you to select your project
3. Store the selection for the current conversation

## Configuration Detection Flow

When the skill is activated, it follows this detection order:

1. **Check workspace context** - Looks for Jira configuration in:

   - `jira-config.md` (in the skill folder, recommended)
   - `CLAUDE.md` / `AGENTS.md`
   - Other workspace documentation files

2. **If not found** - Uses MCP search to discover available projects

3. **If still unclear** - Prompts user to specify project key

4. **Uses detected values** - Applies configuration for all operations

## Example Configuration

Here's a complete example configuration:

```markdown
# Jira Project Configuration

- **Project Key:** DEVPO
- **Cloud ID:** cd98e150-0664-4411-8b41-195f8ff97f1e
- **URL:** https://oneinv.atlassian.net
- **Project Name:** Portal One Investimentos
- **Board URL:** https://oneinv.atlassian.net/jira/software/c/projects/DEVPO/boards
```

## Usage

Once configured, the skill automatically uses your project settings for:

- Searching issues
- Creating tasks, epics, and subtasks
- Updating issues
- Transitioning issue status
- Adding comments
- Querying with JQL

All operations will use your configured project key and cloud ID automatically.

## Troubleshooting

**Skill can't find configuration:**

- Ensure `jira-config.md` exists in the skill folder (next to `SKILL.md`)
- Check that the file contains the required values (Project Key, Cloud ID, URL)
- Verify the format matches the examples above

**SSE deprecation warning / MCP endpoint:**

- The Atlassian Rovo MCP server must use the **Streamable HTTP** transport at
  `https://mcp.atlassian.com/v1/mcp`. The legacy **HTTP+SSE** endpoint
  `https://mcp.atlassian.com/v1/sse` is deprecated and stops working on **30 June 2026**
  ([official notice](https://community.atlassian.com/forums/Atlassian-Remote-MCP-Server/HTTP-SSE-Deprecation-Notice/ba-p/3205484)).
- If you still see the SSE warning, migrate the server and re-auth via `/mcp`:

  ```bash
  claude mcp remove atlassian
  claude mcp add --transport http atlassian https://mcp.atlassian.com/v1/mcp
  ```

**Wrong project being used:**

- Check your configuration file for the correct project key
- The skill uses the first valid configuration it finds
- You can override by specifying the project in your request

**Configuration not detected:**

- The skill will prompt you interactively if no configuration is found
- You can also specify project details directly in your request: "Create a task in PROJECT_KEY project"

## Compatibility

This skill works with:

- Claude Code (config via `jira-config.md` in the skill folder)
- Any workspace with accessible configuration files (`CLAUDE.md`, `AGENTS.md`, docs)
- Interactive mode (prompts for configuration)
