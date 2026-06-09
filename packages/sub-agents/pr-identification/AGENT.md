# sub-agent: pr-identification

Reusable LangGraph ReAct sub-agent that **identifies the pull request to review** based on the current git branch and the **repository coordinates the caller supplies** (owner/repo, parsed from the local git remote). Because the repository is given up front, the sub-agent never searches across repositories — it looks the PR up directly in the named repo. Bundled into top-level agents that depend on it (no standalone build).

- **Package**: `@andrew-codes/better-agents-pkg-sub-agent-pr-identification` (private)
- **Default model**: Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`). Overridable by passing a `model` resolved from the central `config.yml`.
- **System prompt**: empty (`src/prompt.md`).

## Providers

Configured via `gitProvider` (`github` | `bitbucket`). The `GitProvider` / `ProviderConfig` union types come from [`@andrew-codes/better-agents-pkg-types-git-provider`](../../lib/types-git-provider); general MCP types (`McpServerSpec`, `scopeTools`) come from [`@andrew-codes/better-agents-pkg-mcp-utils`](../../lib/mcp-utils). Each provider's config type and MCP server-spec builder live together in their own dedicated lib — [`@andrew-codes/better-agents-pkg-mcp-github`](../../lib/mcp-github) and [`@andrew-codes/better-agents-pkg-mcp-bitbucket`](../../lib/mcp-bitbucket). This sub-agent supplies only the **allowlist**, scoped to **read-only PR/repo metadata**. No tool that returns file contents or diffs is exposed, because the diff is computed locally by the top-level agent via `git diff`.

### GitHub

- MCP: `@modelcontextprotocol/server-github`
- Auth: `GITHUB_TOKEN` (config.yml or env), mapped to the server's `GITHUB_PERSONAL_ACCESS_TOKEN`.
- Allowlisted tools: `list_pull_requests`, `get_pull_request`.

### Bitbucket

- MCP: Atlassian's official [Rovo MCP server](https://support.atlassian.com/bitbucket-cloud/docs/interacting-with-bitbucket-via-mcp/) (remote; reached through the `mcp-remote` stdio proxy).
- Auth: `BITBUCKET_WORKSPACE`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN` (config.yml or env). The email + API token form a Basic `Authorization` header. The Rovo server's Bitbucket tools require API-token auth (OAuth is not yet available for them) and must be enabled by an org admin.
- Allowlisted tools: `getPullRequests`, `getPullRequestDetails`.

Bitbucket remote URLs encode `workspace/repo_slug` the same way GitHub encodes `owner/repo`, so the caller-supplied coordinates work for both providers.

## Output

Returns a structured `PrDetails` object (provider, number, title, url, author, source/target branch, state, draft flag, description) — **excluding** the code diff.

## Usage

```ts
import { createPrIdentificationSubAgent } from "@andrew-codes/better-agents-pkg-sub-agent-pr-identification";

const sub = await createPrIdentificationSubAgent({
  provider: { type: "github", token: process.env.GITHUB_TOKEN! },
});
try {
  // `repo` is parsed from the local git remote by the caller — e.g. via
  // `parseRepoSlug` from `@andrew-codes/better-agents-pkg-sub-agent-git`.
  const pr = await sub.identifyPr("feature/my-branch", {
    owner: "andrew-codes",
    repo: "better-agents",
  });
} finally {
  await sub.close();
}
```
