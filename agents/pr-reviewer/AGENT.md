# agent: pr-reviewer

It reviews the pull request associated with the current git branch by coordinating a fixed workflow across dedicated sub-agents.

- **Package**: `@andrew-codes/better-agents-pr-reviewer`
- **Exposure**: ACP over stdio (`@zed-industries/agent-client-protocol`).

## Workflow

```
detectBranch (git sub-agent)
   → fetchRemote (git sub-agent)                     # `git fetch origin <branch> <default branch>`
   → checkLocalAhead (git sub-agent)                 # stop if local has commits not on origin/<branch>
   → identifyPr (pr-identification sub-agent)        # PR metadata only, no diff; stop if none found
   → computeDiff (git sub-agent)                     # local `git diff` against remote-tracking refs
   → reviewCode (code-reviewer sub-agent)            # comprehensive review of the diff
   → annotateReview (plannotator)                    # human review/revise/approve loop
   → publishFeedback (pr-review-feedback-publisher)  # only when approved; deletes the review file after posting
```

The PR's code diff is always produced locally via `git diff`; it is never fetched from the hosting provider.

The repository is always the current working directory. Before anything else runs, the workflow fetches `origin/<branch>` and `origin/<default branch>` so the rest of the steps compare against the remote's current state rather than potentially stale local refs. The diff base is the PR's target branch (or, if that's unset, the repository's default branch) — always read from the remote-tracking ref (`origin/<branch>`), never the local branch. Neither is configurable.

### Stopping early

The workflow stops — without computing a diff or running a review — and reports back to the user when:

- **No open pull request is found** for the current branch (or the repo's remote can't be determined). Push a branch and open a PR, then try again.
- **The local branch is ahead of `origin/<branch>`.** A review can only reflect what's actually in the pull request, which is whatever has been pushed; push your local commits first.

### Review, annotate, publish

The code review is written to `tmp/reviews/<PR-ID>-YYYY-MM-DD.md` (relative to the repository) and opened in **plannotator** via `plannotator annotate <file> --json`, which blocks until the human resolves the session:

- **approved** — the file holds the approved review; the workflow proceeds to publish.
- **annotated** — the human's feedback is fed back to the code-reviewer sub-agent, which revises the review; the updated file is re-presented. This repeats (bounded) until approval or dismissal.
- **dismissed** — the workflow stops; nothing is published.

On approval, the approved review file is handed to the **pr-review-feedback-publisher** (a deterministic library, not an agent — there is no model in the posting path), which reads it and posts the feedback to the PR using its configured provider, after which the file is deleted from disk. GitHub feedback is posted via the GitHub MCP server; Bitbucket feedback is posted directly via the Bitbucket REST API (the official Rovo MCP server has no line-anchored inline-comment tool).

## Configuration

Read from `~/.config/better-agents/config.yml` under the `pr-reviewer` entry. All keys are optional; defaults are shown.

```yaml
agents:
  - pr-reviewer:
      model:
        name: sonnet-4.6
      env:
        GITHUB_TOKEN: ${GITHUB_TOKEN}
      # Git provider credentials, shared by the pr-identification sub-agent
      # (PR lookup) and the pr-review-feedback-publisher (posting feedback).
      gitProvider: github # github | bitbucket
      github:
        token: ${GITHUB_TOKEN}
      bitbucket:
        workspace: ${BITBUCKET_WORKSPACE}
        email: ${BITBUCKET_EMAIL}
        apiToken: ${BITBUCKET_API_TOKEN}
      subAgents:
        git:
          model:
            name: haiku-4.5 # default model for the git sub-agent
        prIdentification:
          model:
            name: haiku-4.5 # default model for the pr-identification sub-agent
        codeReviewer:
          model:
            name: sonnet-4.6 # default model for the code-reviewer sub-agent
          # Principles the reviewer follows — a string or a list. Combined
          # with the sub-agent's base system prompt.
          principles:
            - Prefer clarity and correctness over cleverness.
            - Flag missing tests and error handling.
            - Call out security and performance risks.
          tone: Direct but collegial; concrete and actionable.
```

`plannotator` must be installed and on `PATH` (the agent shells out to `plannotator annotate <file> --json`).

Provider credentials may be supplied either in `config.yml` or via the corresponding environment variables. The pr-review-feedback-publisher is a deterministic library, not an agent — there is no model in the posting path, and it uses the shared provider credentials above.
