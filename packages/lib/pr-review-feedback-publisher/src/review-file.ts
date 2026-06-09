import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";

/**
 * Read the approved review Markdown from disk, confined to `root` (the
 * repository working directory) so a caller-supplied path cannot escape the
 * repo. Returns the file contents.
 */
async function readReviewFile(path: string, root: string = process.cwd()): Promise<string> {
  const base = resolve(root);
  const target = isAbsolute(path) ? resolve(path) : resolve(base, path);
  if (target !== base && !target.startsWith(`${base}/`)) {
    throw new Error(`Refusing to read outside the repository: ${path}`);
  }
  return readFile(target, "utf8");
}

export { readReviewFile };
