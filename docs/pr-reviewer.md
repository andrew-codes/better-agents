# PR Reviewer

PR Reviewer reviews the pull request open for your current git branch, then walks you through its findings before posting anything back to GitHub or Bitbucket.

## How it works

1. **Syncs with the remote.** It detects the branch you're on and fetches it, along with your repository's default branch, from `origin` — so every check that follows compares against the remote's current state, not stale local refs.
2. **Checks you're pushed up.** If your local branch has commits that aren't on `origin/<branch>`, it stops and asks you to push first — a review can only reflect what's actually in the pull request.
3. **Finds your PR.** It looks up the matching pull request (just the metadata — title, description, target branch — not the diff). If none is open for your branch, it stops here and lets you know.
4. **Computes the diff locally.** It runs `git diff` between the remote-tracking refs for the PR's source and target branches, so your code never has to be fetched from the hosting provider to be reviewed.
5. **Reviews the code.** It produces a written review covering correctness, missing tests/error handling, security, and performance — tailored by any principles and tone you've configured (see below).
6. **Hands the review to you.** The review opens in an interactive annotation view where you can:
   - **Approve** it as-is, or
   - **Annotate** it with your own comments — the agent revises the review based on your feedback and presents the updated version (this can repeat until you're happy), or
   - **Dismiss** it — nothing gets posted.
7. **Publishes your feedback.** Once you approve, the review is posted as feedback on the pull request, and the local review file is deleted.

## Requirements

- [`plannotator`](https://www.npmjs.com/package/plannotator) must be installed and available on your `PATH` — it powers the review/annotate/approve step.
- A personal access token for your git hosting provider (GitHub or Bitbucket), so the agent can look up the PR and post your approved feedback.

## Configuration

Add a `pr-reviewer` entry to `~/.config/better-agents/config.yml`. Every key is optional — defaults are shown below.

```yaml
agents:
  - pr-reviewer:
      model:
        name: sonnet-4.6 # Overrides the default model; available for all agents/sub-agents.
      env:
        GITHUB_TOKEN: ${GITHUB_TOKEN}
      config:
        subAgents:
          prIdentification:
            gitProvider: github # github | bitbucket
            github:
              token: ${GITHUB_TOKEN} # falls back to env GITHUB_TOKEN
            bitbucket:
              workspace: ${BITBUCKET_WORKSPACE}
              email: ${BITBUCKET_EMAIL}
              apiToken: ${BITBUCKET_API_TOKEN}
          codeReviewer:
            # Principles the reviewer follows — a string or a list of strings,
            # combined with its built-in review guidelines.
            principles:
              - Prefer clarity and correctness over cleverness.
              - Flag missing tests and error handling.
              - Call out security and performance risks.
            # The voice the review is written in.
            tone: Direct but collegial; concrete and actionable.
          feedbackPublisher:
            gitProvider: github # github | bitbucket
            github:
              token: ${GITHUB_TOKEN}
            bitbucket:
              workspace: ${BITBUCKET_WORKSPACE}
              email: ${BITBUCKET_EMAIL}
              apiToken: ${BITBUCKET_API_TOKEN}
```

A few things worth knowing:

- **Provider credentials** can be set either directly in `config.yml` or via the corresponding environment variables (`GITHUB_TOKEN`, `BITBUCKET_WORKSPACE`, `BITBUCKET_EMAIL`, `BITBUCKET_API_TOKEN`). `gitProvider` controls which one the agent uses to look up the PR and to publish feedback — set it independently for lookup (`prIdentification`) and publishing (`feedbackPublisher`) if you ever need them to differ. Bitbucket auth uses an Atlassian account email + API token (Basic auth), used both for Atlassian's official Rovo MCP server (PR lookup) and the Bitbucket REST API (publishing inline comments).
- **`principles` and `tone`** are the main levers for shaping review quality — use them to match your team's standards and communication style.
- **`model.name`** picks the model that powers the agent overall; nothing else needs to be configured to get started.
