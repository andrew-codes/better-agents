#!/usr/bin/env tsx
/**
 * Package phase for a top-level agent.
 *
 * Copies the Rspack `.build/` output into `.dist/` and writes a trimmed
 * `package.json` that:
 *   - removes `devDependencies`
 *   - removes any `@andrew-codes/better-agents-pkg-*` dependency (workspace
 *     libs and sub-agents are already bundled inline by Rspack)
 *
 * Usage: tsx tools/package-agent.ts <projectRoot>
 */
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

const BUNDLED_PKG_PREFIX = "@andrew-codes/better-agents-pkg-";

interface AgentPackageJson {
  name: string;
  devDependencies?: Record<string, string>;
  dependencies?: Record<string, string>;
}

async function packageAgent(projectRootArg: string): Promise<void> {
  const projectRoot = resolve(projectRootArg);
  const buildDir = join(projectRoot, ".build");
  const distDir = join(projectRoot, ".dist");

  if (!existsSync(buildDir)) {
    console.error(
      `[package-agent] No .build/ directory at ${buildDir}. Run the build target first.`,
    );
    process.exit(1);
  }

  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });
  await cp(buildDir, distDir, { recursive: true });

  const pkg = JSON.parse(
    await readFile(join(projectRoot, "package.json"), "utf8"),
  ) as AgentPackageJson;

  delete pkg.devDependencies;

  if (pkg.dependencies) {
    for (const name of Object.keys(pkg.dependencies)) {
      if (name.startsWith(BUNDLED_PKG_PREFIX)) {
        delete pkg.dependencies[name];
      }
    }
  }

  await writeFile(
    join(distDir, "package.json"),
    JSON.stringify(pkg, null, 2) + "\n",
  );

  console.log(`[package-agent] Packaged ${pkg.name} -> ${distDir}`);
}

packageAgent(process.argv[2] ?? process.cwd()).catch((err) => {
  console.error(err);
  process.exit(1);
});
