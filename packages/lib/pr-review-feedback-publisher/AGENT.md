# lib: pr-review-feedback-publisher

**Publishes an approved code review to its pull request** as feedback from the user. Bundled into top-level agents that depend on it (no standalone build).

- **Package**: `@andrew-codes/better-agents-pkg-pr-review-feedback-publisher` (private)
- **Not a sub-agent**: this is a plain library, not an agent. Publishing is **deterministic** — there is no LLM in the posting path. The approved review Markdown is parsed in code (`src/parse.ts`) and the PR is updated with a constructed payload (`src/post.ts`). This makes inline-comment placement and the request-changes verdict reliable regardless of any model used elsewhere in the pipeline; an earlier model-driven version repeatedly failed to build the inline comments array and to recover from GitHub's self-review rejection. (It previously lived under `packages/sub-agents/`; it was moved to `packages/lib/` because nothing about it is agentic.)

## How posting works

1. `src/review-file.ts` reads the approved review (confined to `repoRoot`).
2. `src/parse.ts` parses it into a **summary**, **findings** (each anchored to a `` `path:line` `` citation — the end line of a range), the **blocking** flag per finding (from a `###` "Blocking" subheading or a blocking label), and any **Questions**.
3. `src/post.ts` posts the review: summary as the body/general comment, each located finding as an inline comment, and a request-changes outcome when any finding is blocking. Broad findings with no line citation go into the body.

### Recovery

- **Self-review** (GitHub; the reviewing token owns the PR): GitHub forbids `APPROVE`/`REQUEST_CHANGES` on your own PR, so the post degrades the event to `COMMENT`, **keeps the inline comments**, and records the intended verdict at the top of the body. You will never see a formal "changes requested" on a self-authored PR — test that path with a token belonging to a different account.
- **Un-anchorable line** (a cited line not in the diff): on GitHub the offending finding is folded into the body and the review is retried; on Bitbucket that single comment is demoted to a general comment. Feedback is never lost.

## Providers

Configured via `gitProvider` (`github` | `bitbucket`). The `GitProvider` / `ProviderConfig` union types come from [`@andrew-codes/better-agents-pkg-types-git-provider`](../types-git-provider); the per-provider config types live alongside their provider libs ([`mcp-github`](../mcp-github), [`mcp-bitbucket`](../mcp-bitbucket)). The two providers post in **different** ways because their capabilities differ:

### GitHub — via MCP

- MCP: `@modelcontextprotocol/server-github` (`McpServerSpec`/`scopeTools` from [`mcp-utils`](../mcp-utils)).
- Auth: `GITHUB_TOKEN` (config.yml or env), mapped to the server's `GITHUB_PERSONAL_ACCESS_TOKEN`.
- Allowlisted tools: `get_pull_request`, `create_pull_request_review`, `add_issue_comment`. Findings are posted as one review via `create_pull_request_review` — its `body` carries the summary, `event` carries the verdict (`REQUEST_CHANGES` when there are blocking findings, else `COMMENT`), and `comments[]` carries each finding as an inline comment anchored to its file/line. `add_issue_comment` is a fallback for feedback with no line to anchor to. The MCP tools are invoked directly by `post.ts` (no model). (Note: this server version exposes no standalone `add_pull_request_review_comment` tool.)

### Bitbucket — via REST (no MCP)

- The official [Rovo MCP server](https://support.atlassian.com/bitbucket-cloud/docs/interacting-with-bitbucket-via-mcp/) `addPullRequestComment` tool has **no line-anchored inline-comment** capability, so the Bitbucket path posts **directly against the Bitbucket Cloud REST API** instead of starting an MCP server. (`pr-identification` still uses the Rovo MCP for read-only metadata — only this write path is REST.)
- Auth: `BITBUCKET_WORKSPACE`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN` (config.yml or env). The email + API token form a Basic `Authorization` header.
- `POST /2.0/repositories/{workspace}/{repo}/pullrequests/{id}/comments` — the summary is one general comment (`{ content: { raw } }`); each located finding is its own inline comment (`{ content: { raw }, inline: { path, to } }`), anchoring to the new-side line. Bitbucket exposes no request-changes verdict, so a request-changes outcome is stated in the summary comment text. A comment whose line can't be anchored is retried as a general comment.

## Local file access

The review Markdown is read via `src/review-file.ts`, confined to the repository root (`repoRoot`, default `process.cwd()`) so a caller-supplied path cannot escape the repo.

## Usage

```ts
import { createFeedbackPublisher } from "@andrew-codes/better-agents-pkg-pr-review-feedback-publisher";

const publisher = await createFeedbackPublisher({
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
