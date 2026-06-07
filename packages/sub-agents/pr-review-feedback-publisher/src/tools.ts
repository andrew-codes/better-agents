import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

/**
 * Build the local file-read tool the publisher uses to load the approved review
 * file. Reads are confined to `root` (the repository working directory) so the
 * sub-agent cannot read arbitrary paths outside the repo.
 */
function createFileTools(root: string = process.cwd()) {
  const base = resolve(root);

  const readReviewFile = tool(
    async ({ path }) => {
      const target = isAbsolute(path) ? resolve(path) : resolve(base, path);
      if (target !== base && !target.startsWith(`${base}/`)) {
        throw new Error(`Refusing to read outside the repository: ${path}`);
      }
      return readFile(target, "utf8");
    },
    {
      name: "read_review_file",
      description: "Read a code-review Markdown file from the repository and return its contents.",
      schema: z.object({
        path: z.string().describe("Path to the review file, e.g. 'tmp/reviews/123-2026-06-07.md'."),
      }),
    },
  );

  return [readReviewFile];
}

export { createFileTools };
