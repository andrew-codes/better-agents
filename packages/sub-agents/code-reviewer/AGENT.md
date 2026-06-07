# sub-agent: code-reviewer

Reusable sub-agent that performs a **comprehensive review of a pull request's
code diff**. Bundled into top-level agents that depend on it (no standalone
build).

- **Package**: `@andrew-codes/better-agents-pkg-sub-agent-code-reviewer` (private)
- **Default model**: Anthropic Sonnet 4.6 (`claude-sonnet-4-6`). Review quality matters, so this is heavier than the Haiku default of the metadata sub-agents. Overridable by passing a `model` resolved from the central `config.yml`.
- **Tools**: none. Reviewing a supplied diff is a single model invocation.

## Prompt composition

The effective system prompt is the base prompt (`src/prompt.md`) fused with two values sourced from the top-level agent's config:

- `principles` — the review principles the reviewer must follow (string, or a
  list rendered as bullet points).
- `tone` — the desired tone of the feedback.

This mirrors how the top-level `pr-reviewer` agent reads a `config` section per sub-agent.

## Input / output

`review(input)` accepts the unified `diff` plus optional PR `title`,
`description`, and `baseRef`, and returns the review as Markdown.

For an iterative human-in-the-loop flow, pass `revision: { priorReview, feedback }` to have the reviewer revise an earlier review to address human feedback instead of producing a fresh one.

## Usage

```ts
import { createCodeReviewSubAgent } from "@andrew-codes/better-agents-pkg-sub-agent-code-reviewer";

const reviewer = createCodeReviewSubAgent({
  principles: ["Prefer clarity over cleverness", "Flag missing tests"],
  tone: "Direct but collegial.",
});
const markdown = await reviewer.review({ diff, title, description, baseRef });
```
