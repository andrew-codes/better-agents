# Build & distribution

Top-level agent packages go through two phases: **build** then **package**.

## Build phase

- Tool: **Rspack**
- Output: `.build/` directory inside the agent package root (git-ignored)
- Bundles all `@andrew-codes/better-agents-pkg-sub-agent-*` dependencies inline
- Produces JS runnable by modern Node.js

## Package phase

- Output: `.dist/` directory inside the agent package root (git-ignored)
- Copies all `.build/` artifacts into `.dist/`
- Copies `package.json` into `.dist/` with these modifications:
  - Remove all `devDependencies`
  - Remove all `dependencies` whose name starts with `@andrew-codes/better-agents-pkg-sub-agent-` (already bundled)

## Nx integration

Both phases should be defined as Nx targets (`build`, `package`) in each agent's `project.json`. The `build` target depends on `^build` so sub-packages are resolved first.
