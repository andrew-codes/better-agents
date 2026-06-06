# agent: pr-reviewer

It reviews the pull request associated with the
current git branch by coordinating a fixed workflow across dedicated sub-agents.

- **Package**: `@andrew-codes/better-agents-pr-reviewer`
- **Exposure**: ACP over stdio (`@zed-industries/agent-client-protocol`).

## Workflow

```
detectBranch (git sub-agent)
   → identifyPr (pr-identification sub-agent)   # PR metadata only, no diff
   → computeDiff (git sub-agent)                # local `git diff`
```

The PR's code diff is always produced locally via `git diff`; it is never
fetched from the hosting provider.

The repository is always the current working directory, and the diff base is
the PR's target branch — or, when no PR is found, the repository's default
branch (detected from `origin/HEAD`). Neither is configurable.

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
              name: haiku-4.5  # default model for the git sub-agent
          prIdentification:
            model:
              name: haiku-4.5  # default model for the pr-identification sub-agent
            gitProvider: github # github | bitbucket
            github:
              token: ${GITHUB_TOKEN}        # falls back to env GITHUB_TOKEN
            bitbucket:
              username: ${BITBUCKET_USERNAME}
              workspace: ${BITBUCKET_WORKSPACE}
              token: ${BITBUCKET_TOKEN}
```

Provider credentials may be supplied either in `config.yml` or via the
corresponding environment variables.
