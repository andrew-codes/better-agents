import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = dirname(fileURLToPath(import.meta.url));

/**
 * Build the pr-reviewer agent.
 *
 * - Bundles all sub-agent packages (`@andrew-codes/better-agents-pkg-sub-agent-*`)
 *   inline — nothing is externalized except Node built-ins.
 * - Inlines co-located `*.md` system-prompt files as raw strings (`asset/source`).
 * - Emits ESM runnable by modern Node into `.build/`.
 */
export default {
  mode: "production",
  target: "node",
  entry: { index: resolve(root, "src/index.ts") },
  output: {
    path: resolve(root, ".build"),
    filename: "[name].js",
    module: true,
    chunkFormat: "module",
    library: { type: "module" },
  },
  experiments: { outputModule: true },
  resolve: {
    extensions: [".ts", ".js", ".json"],
    // Allow ESM-style ".js" specifiers to resolve to ".ts" sources.
    extensionAlias: { ".js": [".ts", ".js"] },
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        loader: "builtin:swc-loader",
        options: {
          jsc: { parser: { syntax: "typescript" }, target: "es2022" },
        },
        type: "javascript/auto",
      },
      {
        test: /\.md$/,
        type: "asset/source",
      },
    ],
  },
  optimization: { minimize: false },
};
