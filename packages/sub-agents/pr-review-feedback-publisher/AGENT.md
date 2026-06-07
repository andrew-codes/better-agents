# sub-agent: pr-review-feedback-publisher

Reusable LangGraph ReAct sub-agent that **publishes an approved code review to
its pull request** as feedback from the user. Bundled into top-level agents that
depend on it (no standalone build).

- **Package**: `@andrew-codes/better-agents-pkg-sub-agent-pr-review-feedback-publisher` (private)
- **Default model**: Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`).
  Overridable by passing a `model` resolved from the central `config.yml`.
- **System prompt**: `src/prompt.md` — instructs the agent to read the review
  file, extract the relevant feedback, and post it to the PR.

## Providers

Configured via `gitProvider` (`github` | `bitbucket`), exactly like the
pr-identification sub-agent. Each provider is backed by a scoped MCP server, but
here the allowlist includes the provider's **write** tools so the agent can post
to the PR. Only PR comment / review tools are exposed — nothing that edits code
or merges the PR.

### GitHub

- MCP: `@modelcontextprotocol/server-github`
- Auth: `GITHUB_TOKEN` (config.yml or env), mapped to the server's
  `GITHUB_PERSONAL_ACCESS_TOKEN`.
- Allowlisted tools: `get_pull_request`, `create_pull_request_review`,
  `add_pull_request_review_comment`, `add_issue_comment`.

### Bitbucket

- MCP: [`bitbucket-mcp`](https://www.npmjs.com/package/bitbucket-mcp)
- Auth: `BITBUCKET_USERNAME`, `BITBUCKET_WORKSPACE`, `BITBUCKET_TOKEN`
  (config.yml or env).
- Allowlisted tools: `getPullRequest`, `addPullRequestComment`.

## Local file access

The agent also gets a repo-confined `read_review_file` tool so it can read the
approved review Markdown directly. Reads are restricted to the repository root
(`repoRoot`, default `process.cwd()`).

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
