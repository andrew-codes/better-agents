# sub-agent: pr-review-feedback-publisher

Reusable LangGraph ReAct sub-agent that **publishes an approved code review to its pull request** as feedback from the user. Bundled into top-level agents that depend on it (no standalone build).

- **Package**: `@andrew-codes/better-agents-pkg-sub-agent-pr-review-feedback-publisher` (private)
- **Default model**: Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`). Overridable by passing a `model` resolved from the central `config.yml`.
- **System prompt**: `src/prompt.md` — instructs the agent to read the review file, extract the relevant feedback, and post it to the PR.

## Providers

Configured via `gitProvider` (`github` | `bitbucket`), exactly like the pr-identification sub-agent. The `GitProvider` / `ProviderConfig` union types come from [`@andrew-codes/better-agents-pkg-types-git-provider`](../../lib/types-git-provider); general MCP types (`McpServerSpec`, `scopeTools`) come from [`@andrew-codes/better-agents-pkg-mcp-utils`](../../lib/mcp-utils). Each provider's config type and MCP server-spec builder live together in their own dedicated lib — [`@andrew-codes/better-agents-pkg-mcp-github`](../../lib/mcp-github) and [`@andrew-codes/better-agents-pkg-mcp-bitbucket`](../../lib/mcp-bitbucket). This sub-agent supplies only the **allowlist**, scoped to the provider's **write** tools so the agent can post to the PR. Only PR comment / review tools are exposed — nothing that edits code or merges the PR.

### GitHub

- MCP: `@modelcontextprotocol/server-github`
- Auth: `GITHUB_TOKEN` (config.yml or env), mapped to the server's `GITHUB_PERSONAL_ACCESS_TOKEN`.
- Allowlisted tools: `get_pull_request`, `create_pull_request_review`, `add_issue_comment`. Findings are posted as one review via `create_pull_request_review` — its `body` carries the summary, `event` carries the verdict (`REQUEST_CHANGES` when there are blocking findings, else `COMMENT`), and `comments[]` carries each finding as an inline comment anchored to its file/line. `add_issue_comment` is a fallback for feedback with no line to anchor to. (Note: this server version exposes no standalone `add_pull_request_review_comment` tool.)

### Bitbucket

- MCP: [`bitbucket-mcp`](https://www.npmjs.com/package/bitbucket-mcp)
- Auth: `BITBUCKET_USERNAME`, `BITBUCKET_WORKSPACE`, `BITBUCKET_TOKEN` (config.yml or env).
- Allowlisted tools: `getPullRequest`, `addPullRequestComment`. The summary is posted as a general comment; each located finding is a separate `addPullRequestComment` with `inline: { path, to }` anchoring it to the new-side line. Bitbucket exposes no request-changes verdict here, so a request-changes outcome is stated in the summary comment text.

## Local file access

The agent also gets a repo-confined `read_review_file` tool so it can read the approved review Markdown directly. Reads are restricted to the repository root (`repoRoot`, default `process.cwd()`).

## Usage

```ts
import { createFeedbackPublisherSubAgent } from "@andrew-codes/better-agents-pkg-sub-agent-pr-review-feedback-publisher";

const publisher = await createFeedbackPublisherSubAgent({
  provider: { type: "github", token: process.env.GITHUB_TOKEN! },
});
try {
  await publisher.publish({
    reviewFilePath: "tmp/reviews/123-2026-06-07.md",
    target: { number: 123, url: "https://github.com/owner/repo/pull/123" },
  });
} finally {
  await publisher.close();
}
```
