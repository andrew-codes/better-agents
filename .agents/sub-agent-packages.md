# Sub-agent packages

Sub-agents are reusable LangGraph agents shared across one or more top-level agents.

## Location and naming

- Live in `packages/sub-agents/<name>/`.
- Package name must follow: `@andrew-codes/better-agents-pkg-sub-agent-<name>`.
- Must be marked `"private": true` in `package.json`.

## Build behavior

- Sub-agent packages are **not built independently**.
- They are bundled directly into whichever top-level agent packages depend on them (via Rspack).
- No standalone build script is required.

## Usage

A top-level agent lists sub-agents as `dependencies`. Rspack recognizes the broader `@andrew-codes/better-agents-pkg-` prefix (which covers sub-agents and [shared libs](lib-packages.md)) and bundles them inline. The distributed `package.json` for the top-level agent omits these dependencies since they are already bundled.
