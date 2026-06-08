# sub-agent: git

Reusable LangGraph ReAct sub-agent for **local git operations**. Bundled into top-level agents that depend on it (no standalone build).

- **Package**: `@andrew-codes/better-agents-pkg-sub-agent-git` (private)
- **Default model**: Anthropic Haiku 4.5 (`claude-haiku-4-5-20251001`). Overridable by passing a `model` from the central `config.yml`.
- **System prompt**: empty (`src/prompt.md`). Behaviour is driven by the task message the orchestrator sends.

## Tools (read-oriented)

| Tool | Source | Purpose |
| --- | --- | --- |
| `git_current_branch` | custom | Name of the checked-out branch |
| `git_default_branch` | custom | Repo's default branch (from `origin/HEAD`, falling back to local `main`/`master`) |
| `git_remote_url` | custom | Fetch URL of a remote (defaults to `origin`) |
| `git_status` | MCP | Working-tree status |
| `git_diff` | custom | Unified diff (`base...head` range or working tree vs `base`) |
| `git_log` | custom | Commit log lines |
| `git_merge_base` | custom | Common ancestor of two refs |

Custom tools run via `execFile("git", [...args])` — array-form arguments, never a shell — so caller input cannot inject shell metacharacters.

## Remote parsing

The package also exports `parseRepoSlug(url)`, which extracts the owner/repo (GitHub) or workspace/repo-slug (Bitbucket) from a git remote URL — both providers encode them as the final two path segments, across scp-like (`git@host:owner/repo.git`), `https://`, and `ssh://` shapes. Paired with `git_remote_url`, this lets an orchestrator scope a PR lookup to the exact repository without searching.

## MCP integration

`git_status` is delegated to the official Git MCP server (https://mcpservers.org/servers/modelcontextprotocol/git, run via `uvx mcp-server-git --repository <path>`) through `@andrew-codes/better-agents-pkg-mcp-git`. The repository path defaults to `process.cwd()` (or the `git.cwd` option, when supplied). The remaining tools stay custom because the orchestrator depends on `git_diff` producing symmetric `base...head` ranges and `git_log` producing `base..head` ranges — capabilities the MCP server's equivalents don't support — and because `git_current_branch`/`git_default_branch`/`git_merge_base` have no MCP equivalents.

Because tool loading is asynchronous, `createGitSubAgent` now returns a `Promise<GitSubAgent>`, and the returned agent exposes `close()` to disconnect the MCP server subprocess.

## Usage

```ts
import { createGitSubAgent } from "@andrew-codes/better-agents-pkg-sub-agent-git";

const git = await createGitSubAgent({ git: { cwd: repoPath } });
try {
  const result = await git.invoke({
    messages: [{ role: "user", content: "What is the current branch?" }],
  });
} finally {
  await git.close();
}
```
