# sub-agent: git

Reusable LangGraph ReAct sub-agent for **local git operations**. Bundled into
top-level agents that depend on it (no standalone build).

- **Package**: `@andrew-codes/better-agents-pkg-sub-agent-git` (private)
- **Default model**: Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`).
  Overridable by passing a `model` from the central `config.yml`.
- **System prompt**: empty (`src/prompt.md`). Behaviour is driven by the task
  message the orchestrator sends.

## Tools (read-oriented, no shell)

| Tool                 | Purpose                                                                           |
| -------------------- | --------------------------------------------------------------------------------- |
| `git_current_branch` | Name of the checked-out branch                                                    |
| `git_default_branch` | Repo's default branch (from `origin/HEAD`, falling back to local `main`/`master`) |
| `git_status`         | Porcelain working-tree status                                                     |
| `git_diff`           | Unified diff (`base...head` range or working tree vs `base`)                      |
| `git_log`            | Commit log lines                                                                  |
| `git_merge_base`     | Common ancestor of two refs                                                       |

All commands run via `execFile("git", [...args])` — array-form arguments, never
a shell — so caller input cannot inject shell metacharacters.

## Usage

```ts
import { createGitSubAgent } from "@andrew-codes/better-agents-pkg-sub-agent-git";

const git = createGitSubAgent({ git: { cwd: repoPath } });
const result = await git.invoke({
  messages: [{ role: "user", content: "What is the current branch?" }],
});
```
