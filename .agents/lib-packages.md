# Library packages

Shared library packages hold reusable, non-agent logic used by multiple top-level agents and/or sub-agents.

## Location and naming

- Live in `packages/lib/<name>/`.
- Package name must follow: `@andrew-codes/better-agents-pkg-<name>`.
- Must be marked `"private": true` in `package.json`.
- Packages that export **only types** (no runtime functions) use a `types-<name>` directory and package name, e.g. `packages/lib/types-git-provider/` → `@andrew-codes/better-agents-pkg-types-git-provider`. This signals at a glance that importing the package has no runtime cost. Once a package needs to export a function (even a small helper alongside its types), drop the `types-` prefix — see `mcp-utils` below.

(Sub-agent packages are a specialization of this convention, using the longer `@andrew-codes/better-agents-pkg-sub-agent-<name>` prefix.)

## Build behavior

- Library packages are **not built independently**.
- Like sub-agents, any dependency whose name starts with `@andrew-codes/better-agents-pkg-` is bundled inline by Rspack into the consuming top-level agent and stripped from the distributed `package.json`.

## Current libraries

- `@andrew-codes/better-agents-pkg-model` — resolves a `ModelConfig` (friendly name + provider options) into a concrete LangChain chat model. Exposes `resolveModel`, `resolveModelOrDefault`, and `DEFAULT_MODEL_NAME`.
- `@andrew-codes/better-agents-pkg-config` — loads a single agent's entry from the central `config.yml` with `${VAR}` expansion. Exposes `loadAgentConfig`, `expandEnv`, `applyEnv`, and `defaultConfigPath`. Each agent supplies its own typed config shape.
- `@andrew-codes/better-agents-pkg-mcp-utils` — general-purpose MCP types and helper functions, applicable to _any_ MCP server (not just git providers). Exposes the `McpServerSpec` type (a stdio server spec plus its caller-chosen tool allowlist) and the `scopeTools` function for restricting a connected client's tools to that allowlist. Not named with the `types-` prefix because it exports runtime code, not just types.
- `@andrew-codes/better-agents-pkg-types-git-provider` — the narrow slice of types specific to git-host providers: `GitProvider` (`"github" | "bitbucket"`) and the `ProviderConfig` union. The member config types (`GitHubProviderConfig`, `BitbucketProviderConfig`) live alongside their respective MCP packages (see below) and are re-exported into the union here.
- `@andrew-codes/better-agents-pkg-mcp-github` — the GitHub provider's config type (`GitHubProviderConfig`) and its MCP server-spec builder. Exposes `githubMcp(config, allowedTools)`, returning an `McpServerSpec` (uses `@modelcontextprotocol/server-github`, authenticated via `GITHUB_PERSONAL_ACCESS_TOKEN`). The caller supplies `allowedTools` — what should be exposed depends on the sub-agent's purpose (read-only metadata vs. posting feedback), not on the provider.
- `@andrew-codes/better-agents-pkg-mcp-bitbucket` — the Bitbucket provider's config type (`BitbucketProviderConfig`) and its MCP server-spec builder. Exposes `bitbucketMcp(config, allowedTools)`, returning an `McpServerSpec` (uses the `bitbucket-mcp` package, authenticated via username/workspace/token). Same caller-supplied `allowedTools` contract as the GitHub package.
- `@andrew-codes/better-agents-pkg-mcp-git` — config type (`GitMcpConfig`) and MCP server-spec builder for the official **local-repository** Git server (https://mcpservers.org/servers/modelcontextprotocol/git). Exposes `gitMcp(config, allowedTools)`, returning an `McpServerSpec` (run via `uvx mcp-server-git --repository <path>`). Operates on the working tree directly — no host credentials required. Same caller-supplied `allowedTools` contract as the other MCP packages.
