# agent: pr-reviewer

It reviews the pull request associated with the
current git branch by coordinating a fixed workflow across dedicated sub-agents.

- **Package**: `@andrew-codes/better-agents-pr-reviewer`
- **Exposure**: ACP over stdio (`@zed-industries/agent-client-protocol`).

## Workflow

```
detectBranch (git sub-agent)
   → identifyPr (pr-identification sub-agent)        # PR metadata only, no diff
   → computeDiff (git sub-agent)                     # local `git diff`
   → reviewCode (code-reviewer sub-agent)            # comprehensive review of the diff
   → annotateReview (plannotator)                    # human review/revise/approve loop
   → publishFeedback (pr-review-feedback-publisher)  # only when approved
```

The PR's code diff is always produced locally via `git diff`; it is never
fetched from the hosting provider.

The repository is always the current working directory, and the diff base is
the PR's target branch — or, when no PR is found, the repository's default
branch (detected from `origin/HEAD`). Neither is configurable.

### Review, annotate, publish

The code review is written to `tmp/reviews/<PR-ID>-YYYY-MM-DD.md` (relative to
the repository) and opened in **plannotator** via `plannotator annotate <file>
--json`, which blocks until the human resolves the session:

- **approved** — the file holds the approved review; the workflow proceeds to
  publish.
- **annotated** — the human's feedback is fed back to the code-reviewer
  sub-agent, which revises the review; the updated file is re-presented. This
  repeats (bounded) until approval or dismissal.
- **dismissed** — the workflow stops; nothing is published.

On approval, the approved review file is handed to the
**pr-review-feedback-publisher** sub-agent, which reads it and posts the
feedback to the PR using its configured provider. When there is no PR, nothing
is published.

## Configuration

Read from `~/.config/better-agents/config.yml` under the `pr-reviewer` entry.
All keys are optional; defaults are shown.

```yaml
agents:
  - pr-reviewer:
      model:
        name: sonnet-4.6
      env:
        GITHUB_TOKEN: ${GITHUB_TOKEN}
      config:
        subAgents:
          git:
            model:
              name: haiku-4.5 # default model for the git sub-agent
          prIdentification:
            model:
              name: haiku-4.5 # default model for the pr-identification sub-agent
            gitProvider: github # github | bitbucket
            github:
              token: ${GITHUB_TOKEN} # falls back to env GITHUB_TOKEN
            bitbucket:
              username: ${BITBUCKET_USERNAME}
              workspace: ${BITBUCKET_WORKSPACE}
              token: ${BITBUCKET_TOKEN}
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
          feedbackPublisher:
            model:
              name: haiku-4.5 # default model for the feedback-publisher sub-agent
            gitProvider: github # github | bitbucket
            github:
              token: ${GITHUB_TOKEN} # falls back to env GITHUB_TOKEN
            bitbucket:
              username: ${BITBUCKET_USERNAME}
              workspace: ${BITBUCKET_WORKSPACE}
              token: ${BITBUCKET_TOKEN}
```

`plannotator` must be installed and on `PATH` (the agent shells out to
`plannotator annotate <file> --json`).

Provider credentials may be supplied either in `config.yml` or via the
corresponding environment variables.
