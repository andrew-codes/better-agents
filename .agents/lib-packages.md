# Library packages

Shared library packages hold reusable, non-agent logic used by multiple
top-level agents and/or sub-agents.

## Location and naming

- Live in `packages/lib/<name>/`.
- Package name must follow: `@andrew-codes/better-agents-pkg-<name>`.
- Must be marked `"private": true` in `package.json`.

(Sub-agent packages are a specialization of this convention, using the longer
`@andrew-codes/better-agents-pkg-sub-agent-<name>` prefix.)

## Build behavior

- Library packages are **not built independently**.
- Like sub-agents, any dependency whose name starts with
  `@andrew-codes/better-agents-pkg-` is bundled inline by Rspack into the
  consuming top-level agent and stripped from the distributed `package.json`.

## Current libraries

- `@andrew-codes/better-agents-pkg-model` — resolves a `ModelConfig`
  (friendly name + provider options) into a concrete LangChain chat model.
  Exposes `resolveModel`, `resolveModelOrDefault`, and `DEFAULT_MODEL_NAME`.
- `@andrew-codes/better-agents-pkg-config` — loads a single agent's entry from
  the central `config.yml` with `${VAR}` expansion. Exposes `loadAgentConfig`,
  `expandEnv`, `applyEnv`, and `defaultConfigPath`. Each agent supplies its own
  typed config shape.
