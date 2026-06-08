# Better Agents

A collection of AI agents that plug into your editor (e.g. [Zed](https://zed.dev)) over the Agent Communication Protocol (ACP) to help with everyday development tasks like reviewing code.

## Available agents

| Agent | What it does |
| --- | --- |
| [PR Reviewer](docs/pr-reviewer.md) | Reviews the pull request for your current branch, walks you through the findings, and posts your approved feedback to GitHub or Bitbucket. |

More agents will be added over time.

## Configuration

Agents are configured through a single YAML file at:

```
~/.config/better-agents/config.yml
```

Each agent reads its own entry from this file (model choice, credentials, and agent-specific options). See an agent's page in [`docs/`](docs/) for the settings it supports.

## License

[GNU Affero General Public License v3.0](LICENSE)
