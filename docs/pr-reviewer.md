# PR Reviewer

PR Reviewer reviews the pull request open for your current git branch, then walks you through its findings before posting anything back to GitHub or Bitbucket.

## How it works

1. **Finds your PR.** It detects the branch you're on and looks up the matching pull request (just the metadata — title, description, target branch — not the diff).
2. **Computes the diff locally.** It runs `git diff` against the PR's target branch (or your repository's default branch if there's no open PR), so your code never has to be fetched from the hosting provider to be reviewed.
3. **Reviews the code.** It produces a written review covering correctness, missing tests/error handling, security, and performance — tailored by any principles and tone you've configured (see below).
4. **Hands the review to you.** The review opens in an interactive annotation view where you can:
   - **Approve** it as-is, or
   - **Annotate** it with your own comments — the agent revises the review based on your feedback and presents the updated version (this can repeat until you're happy), or
   - **Dismiss** it — nothing gets posted.
5. **Publishes your feedback.** Once you approve, the review is posted as feedback on the pull request. If there's no open PR, nothing is published.

## Requirements

- [`plannotator`](https://www.npmjs.com/package/plannotator) must be installed and available on your `PATH` — it powers the review/annotate/approve step.
- A personal access token for your git hosting provider (GitHub or Bitbucket), so the agent can look up the PR and post your approved feedback.

## Configuration

Add a `pr-reviewer` entry to `~/.config/better-agents/config.yml`. Every key is optional — defaults are shown below.

```yaml
agents:
  - pr-reviewer:
      model:
        name: sonnet-4.6
      env:
        GITHUB_TOKEN: ${GITHUB_TOKEN}
      config:
        subAgents:
          prIdentification:
            gitProvider: github # github | bitbucket
            github:
              token: ${GITHUB_TOKEN} # falls back to env GITHUB_TOKEN
            bitbucket:
              username: ${BITBUCKET_USERNAME}
              workspace: ${BITBUCKET_WORKSPACE}
              token: ${BITBUCKET_TOKEN}
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
              username: ${BITBUCKET_USERNAME}
              workspace: ${BITBUCKET_WORKSPACE}
              token: ${BITBUCKET_TOKEN}
```

A few things worth knowing:

- **Provider credentials** can be set either directly in `config.yml` or via the corresponding environment variables (`GITHUB_TOKEN`, `BITBUCKET_USERNAME`, `BITBUCKET_WORKSPACE`, `BITBUCKET_TOKEN`). `gitProvider` controls which one the agent uses to look up the PR and to publish feedback — set it independently for lookup (`prIdentification`) and publishing (`feedbackPublisher`) if you ever need them to differ.
- **`principles` and `tone`** are the main levers for shaping review quality — use them to match your team's standards and communication style.
- **`model.name`** picks the model that powers the agent overall; nothing else needs to be configured to get started.
