# sub-agent: pr-identification

Reusable LangGraph ReAct sub-agent that **identifies the pull request to
review** based on the current git branch and the configured git provider.
Bundled into top-level agents that depend on it (no standalone build).

- **Package**: `@andrew-codes/better-agents-pkg-sub-agent-pr-identification` (private)
- **Default model**: Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`). Overridable
  by passing a `model` resolved from the central `config.yml`.
- **System prompt**: empty (`src/prompt.md`).

## Providers

Configured via `gitProvider` (`github` | `bitbucket`). Each provider is backed
by a scoped MCP server exposing **read-only PR/repo metadata only** — no tool
that returns file contents or diffs is allowlisted, because the diff is
computed locally by the top-level agent via `git diff`.

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
