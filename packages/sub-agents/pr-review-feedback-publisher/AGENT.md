# sub-agent: pr-review-feedback-publisher

**Publishes an approved code review to its pull request** as feedback from the user. Bundled into top-level agents that depend on it (no standalone build).

- **Package**: `@andrew-codes/better-agents-pkg-sub-agent-pr-review-feedback-publisher` (private)
- **No model**: despite the "sub-agent" name, publishing is **deterministic** — there is no LLM in the posting path. The approved review Markdown is parsed in code (`src/parse.ts`) and the provider's PR-review API is called directly with a constructed payload (`src/post.ts`). This makes inline-comment placement and the request-changes verdict reliable regardless of any model used elsewhere in the pipeline; an earlier model-driven version repeatedly failed to build the inline `comments[]` array and to recover from GitHub's self-review rejection.

## How posting works

1. `src/review-file.ts` reads the approved review (confined to `repoRoot`).
2. `src/parse.ts` parses it into a **summary**, **findings** (each anchored to a `` `path:line` `` citation — the end line of a range), the **blocking** flag per finding (from a `###` "Blocking" subheading or a blocking label), and any **Questions**.
3. `src/post.ts` posts one review: summary as the body, each located finding as an inline comment, verdict = `REQUEST_CHANGES` when any finding is blocking (else `COMMENT`). Broad findings with no line citation go into the body.

### Recovery

- **Self-review** (the reviewing token owns the PR): GitHub forbids `APPROVE`/`REQUEST_CHANGES` on your own PR, so the post degrades the event to `COMMENT`, **keeps the inline comments**, and records the intended verdict at the top of the body. You will never see a formal "changes requested" on a self-authored PR — test that path with a token belonging to a different account.
- **Un-anchorable line** (a cited line not in the server's diff): the offending finding is folded into the body and the review is retried, so feedback is never lost.

## Providers

Configured via `gitProvider` (`github` | `bitbucket`), exactly like the pr-identification sub-agent. The `GitProvider` / `ProviderConfig` union types come from [`@andrew-codes/better-agents-pkg-types-git-provider`](../../lib/types-git-provider); general MCP types (`McpServerSpec`, `scopeTools`) come from [`@andrew-codes/better-agents-pkg-mcp-utils`](../../lib/mcp-utils). Each provider's config type and MCP server-spec builder live together in their own dedicated lib — [`@andrew-codes/better-agents-pkg-mcp-github`](../../lib/mcp-github) and [`@andrew-codes/better-agents-pkg-mcp-bitbucket`](../../lib/mcp-bitbucket). This sub-agent supplies only the **allowlist**, scoped to the provider's **write** tools. The MCP client is used purely for authenticated access to those tools, which `post.ts` invokes directly — only PR comment / review tools are exposed, nothing that edits code or merges the PR.

### GitHub

- MCP: `@modelcontextprotocol/server-github`
- Auth: `GITHUB_TOKEN` (config.yml or env), mapped to the server's `GITHUB_PERSONAL_ACCESS_TOKEN`.
- Allowlisted tools: `get_pull_request`, `create_pull_request_review`, `add_issue_comment`. Findings are posted as one review via `create_pull_request_review` — its `body` carries the summary, `event` carries the verdict (`REQUEST_CHANGES` when there are blocking findings, else `COMMENT`), and `comments[]` carries each finding as an inline comment anchored to its file/line. `add_issue_comment` is a fallback for feedback with no line to anchor to. (Note: this server version exposes no standalone `add_pull_request_review_comment` tool.)

### Bitbucket

- MCP: [`bitbucket-mcp`](https://www.npmjs.com/package/bitbucket-mcp)
- Auth: `BITBUCKET_USERNAME`, `BITBUCKET_WORKSPACE`, `BITBUCKET_TOKEN` (config.yml or env).
- Allowlisted tools: `getPullRequest`, `addPullRequestComment`. The summary is posted as a general comment; each located finding is a separate `addPullRequestComment` with `inline: { path, to }` anchoring it to the new-side line. Bitbucket exposes no request-changes verdict here, so a request-changes outcome is stated in the summary comment text.

## Local file access

The review Markdown is read via `src/review-file.ts`, confined to the repository root (`repoRoot`, default `process.cwd()`) so a caller-supplied path cannot escape the repo.

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
