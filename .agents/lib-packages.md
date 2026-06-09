# Library packages

Shared library packages hold reusable, non-agent logic used by multiple top-level agents and/or sub-agents.

## Location and naming

- Live in `packages/lib/<name>/`.
- Package name must follow: `@andrew-codes/better-agents-pkg-<name>`.
- Must be marked `"private": true` in `package.json`.
- Packages that export **only types** (no runtime functions) use a `types-<name>` directory and package name, e.g. `packages/lib/types-git-provider/` → `@andrew-codes/better-agents-pkg-types-git-provider`. This signals at a glance that importing the package has no runtime cost. Once a package needs to export a function (even a small helper alongside its types), drop the `types-` prefix — see `mcp-utils` below.

(Sub-agent packages are a specialization of this convention, using the longer `@andrew-codes/better-agents-pkg-sub-agent-<name>` prefix.)

## Build behavior

- Library packages are **not built independently**.
- Like sub-agents, any dependency whose name starts with `@andrew-codes/better-agents-pkg-` is bundled inline by Rspack into the consuming top-level agent and stripped from the distributed `package.json`.
