# better-agents

A Yarn 4 monorepo of LangGraph-based AI agents exposed to editors (e.g. Zed) via the Agent Communication Protocol (ACP).

## Package manager

Use **Yarn 4** (Berry). Never use `npm` or `npx`. Install: `yarn install`. Run scripts: `yarn <script>`.

## Workspace layout

```
agents/                # Top-level ACP agents (user-facing entrypoints)
packages/sub-agents/   # Sub-agent packages bundled into top-level agents
packages/lib/          # Shared library packages bundled into agents
tools/                 # Repo tooling scripts (TypeScript, run via tsx)
```

All `@andrew-codes/better-agents-pkg-*` workspace packages (sub-agents and
shared libs) are bundled inline into top-level agents at build time and
stripped from the distributed `package.json`.

## Commands

| Task      | Command                               |
| --------- | ------------------------------------- |
| Build all | `yarn build` / `nx run-many -t build` |
| Test all  | `yarn test`                           |
| Typecheck | `yarn typecheck`                      |
| Lint      | `yarn lint`                           |

Run a single project: `nx run <project-name>:<target>` (e.g. `nx run pr-reviewer:build`).

## Further reading

- [Agent packages](.agents/agent-packages.md) — top-level agent conventions, ACP exposure, and system prompts
- [Sub-agent packages](.agents/sub-agent-packages.md) — naming, bundling, private package rules
- [Library packages](.agents/lib-packages.md) — shared `pkg-*` libs bundled into agents
- [Build & distribution](.agents/build-distribution.md) — Rspack build phase, `.build`/`.dist` output
- [Agent configuration](.agents/agent-configuration.md) — runtime YAML config, models, MCP servers
