# Agent packages

Top-level agents live in `agents/<agent-name>/`. They are the user-facing entrypoints consumed via ACP using `@agentclientprotocol/sdk`.

## Rules

- Each agent is a separate Yarn workspace package.
- Agents expose themselves over ACP — they are what editors like Zed connect to.

## Dependencies

- Use `@langgraph/sdk` (LangGraph TS SDK) to define agent graphs.
- Use `@agentclientprotocol/sdk` for ACP exposure.
- Local sub-agent packages (prefixed `@andrew-codes/better-agents-pkg-sub-agent-`) are listed as regular `dependencies` — they get bundled at build time and stripped from the distributed `package.json`.

## System prompts

Each agent's system prompt is a **Markdown file** inlined into the bundle at build time via a Rspack plugin. Co-locate the `.md` file within the agent package. The markdown file is the single source of truth — do not hardcode prompt text in TS source.
