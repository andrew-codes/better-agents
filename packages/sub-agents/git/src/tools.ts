import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  currentBranch,
  defaultBranch,
  mergeBase,
  remoteUrl,
  runGit,
  type GitContext,
} from "./git.js";

/**
 * Build the set of read-oriented git tools the sub-agent is allowed to use.
 * Each tool maps to a single git subcommand invoked with array-form args, so
 * there is no shell and no arbitrary-command surface.
 */
function createGitTools(ctx: GitContext = {}) {
  const gitCurrentBranch = tool(async () => currentBranch(ctx), {
    name: "git_current_branch",
    description: "Return the name of the currently checked-out git branch.",
    schema: z.object({}),
  });

  const gitDefaultBranch = tool(async () => defaultBranch(ctx), {
    name: "git_default_branch",
    description:
      "Return the repository's default branch (from origin/HEAD, falling back to a local main/master).",
    schema: z.object({}),
  });

  const gitRemoteUrl = tool(async ({ remote }) => remoteUrl(remote ?? "origin", ctx), {
    name: "git_remote_url",
    description:
      "Return the fetch URL of a git remote (defaults to 'origin'). The owner/repo (workspace/repo-slug) can be parsed from the returned URL.",
    schema: z.object({
      remote: z.string().optional().describe("Remote name, defaults to 'origin'."),
    }),
  });

  const gitDiff = tool(
    async ({ base, head, paths }) => {
      const args = ["diff"];
      if (base && head) {
        args.push(`${base}...${head}`);
      } else if (base) {
        args.push(base);
      }
      if (paths?.length) {
        args.push("--", ...paths);
      }
      return runGit(args, ctx);
    },
    {
      name: "git_diff",
      description:
        "Return a unified diff. With `base` and `head`, diffs the symmetric range base...head (changes on head since it diverged from base). With only `base`, diffs the working tree against base. Optionally restrict to `paths`.",
      schema: z.object({
        base: z.string().optional().describe("Base ref, e.g. 'origin/main'."),
        head: z.string().optional().describe("Head ref, e.g. the PR branch or 'HEAD'."),
        paths: z.array(z.string()).optional().describe("Restrict the diff to these paths."),
      }),
    },
  );

  const gitLog = tool(
    async ({ base, head, maxCount }) => {
      const args = ["log", `--max-count=${maxCount ?? 50}`, "--pretty=format:%H%x09%an%x09%s"];
      if (base && head) {
        args.push(`${base}..${head}`);
      } else if (head) {
        args.push(head);
      }
      return runGit(args, ctx);
    },
    {
      name: "git_log",
      description:
        "Return commit log lines (hash, author, subject). With `base` and `head`, lists commits on head not in base.",
      schema: z.object({
        base: z.string().optional(),
        head: z.string().optional(),
        maxCount: z.number().int().positive().optional(),
      }),
    },
  );

  const gitMergeBase = tool(async ({ ref, base }) => mergeBase(ref, base, ctx), {
    name: "git_merge_base",
    description: "Return the best common ancestor commit of `ref` and `base`.",
    schema: z.object({
      ref: z.string().describe("Typically the PR/topic branch or HEAD."),
      base: z.string().describe("Typically the target branch, e.g. 'origin/main'."),
    }),
  });

  return [gitCurrentBranch, gitDefaultBranch, gitRemoteUrl, gitDiff, gitLog, gitMergeBase];
}

export { createGitTools };
