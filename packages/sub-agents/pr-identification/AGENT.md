# sub-agent: pr-identification

Reusable LangGraph ReAct sub-agent that **identifies the pull request to
review** based on the current git branch and the configured git provider.
Bundled into top-level agents that depend on it (no standalone build).

- **Package**: `@andrew-codes/better-agents-pkg-sub-agent-pr-identification` (private)
- **Default model**: Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`). Overridable
  by passing a `model` resolved from the central `config.yml`.
- **System prompt**: empty (`src/prompt.md`).

## Providers

Configured via `gitProvider` (`github` | `bitbucket`). The `GitProvider` /
`ProviderConfig` union types come from
[`@andrew-codes/better-agents-pkg-types-git-provider`](../../lib/types-git-provider);
general MCP types (`McpServerSpec`, `scopeTools`) come from
[`@andrew-codes/better-agents-pkg-mcp-utils`](../../lib/mcp-utils). Each
provider's config type and MCP server-spec builder live together in their own
dedicated lib —
[`@andrew-codes/better-agents-pkg-mcp-github`](../../lib/mcp-github) and
[`@andrew-codes/better-agents-pkg-mcp-bitbucket`](../../lib/mcp-bitbucket).
This sub-agent supplies only the **allowlist**, scoped to **read-only PR/repo
metadata**. No tool that returns file contents or diffs is exposed, because the
diff is computed locally by the top-level agent via `git diff`.

### GitHub

- MCP: `@modelcontextprotocol/server-github`
- Auth: `GITHUB_TOKEN` (config.yml or env), mapped to the server's
  `GITHUB_PERSONAL_ACCESS_TOKEN`.
- Allowlisted tools: `list_pull_requests`, `get_pull_request`, `search_repositories`.

### Bitbucket

- MCP: [`bitbucket-mcp`](https://www.npmjs.com/package/bitbucket-mcp)
- Auth: `BITBUCKET_USERNAME`, `BITBUCKET_WORKSPACE`, `BITBUCKET_TOKEN`
  (config.yml or env).
- Allowlisted tools: `getPullRequests`, `getPullRequest`, `getRepository`.

## Output

Returns a structured `PrDetails` object (provider, number, title, url, author,
source/target branch, state, draft flag, description) — **excluding** the code
diff.

## Usage

```ts
import { createPrIdentificationSubAgent } from "@andrew-codes/better-agents-pkg-sub-agent-pr-identification";

const sub = await createPrIdentificationSubAgent({
  provider: { type: "github", token: process.env.GITHUB_TOKEN! },
});
try {
  const pr = await sub.identifyPr("feature/my-branch");
} finally {
  await sub.close();
}
```
