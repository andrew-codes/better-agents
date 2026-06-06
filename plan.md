The first top level agent to be built is named `pr-reviewer`. It follows a specific workflow coordinating sub-agents. Each step in the workflow is handled by a separate sub-agent.

## Sub-agents
1. Git: used for git operations. Default model should be anthropic's haiku 4.5, but can be overridden by the central config.yml file. It should also have an empty system agent prompt.
2. PR Identification: identifies PRs to review based on current git branch. Deafult model should be haiku. It should have an empty system agent prompt. Agent configuration allows specifying `gitProvider` (e.g. `github`, `bitbucket`).

For github, the agent uses the github MCP. The env var `GITHUB_TOKEN` is required for github authentication. It can be specified in the central config.yml file or as an environment variable. It should use scoped tools for accessing github resources; only allowing reading repo and PR data.

For bitbucket, use the https://www.npmjs.com/package/bitbucket-mcp MCP server. It should be configured with `BITBUCKET_USERNAME`, `BITBUCKET_WORKSPACE`, and `BITBUCKET_TOKEN`. These can be specified in the central config.yml file or as environment variables. This should use scoped tools for accessing bitbucket resources; such as `getPullRequests` and looking up the repo.

The agent should locate the PR to review based on the current git branch and the `gitProvider` configuration. It should return the PR details to the top level agent; except for the code diff. The code diff will be determined locally via `git diff` on a local branch.
