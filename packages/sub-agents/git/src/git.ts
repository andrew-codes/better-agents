import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 32 * 1024 * 1024; // 32MB — diffs can be large.

interface GitContext {
  /** Working directory the git commands run in. Defaults to process.cwd(). */
  cwd?: string;
}

/**
 * Run a git subcommand with explicit, array-form arguments (no shell), so
 * caller-supplied values can never be interpreted as shell metacharacters.
 */
async function runGit(args: readonly string[], ctx: GitContext = {}): Promise<string> {
  const { stdout } = await execFileAsync("git", [...args], {
    cwd: ctx.cwd ?? process.cwd(),
    maxBuffer: MAX_BUFFER,
  });
  return stdout.trimEnd();
}

async function currentBranch(ctx?: GitContext): Promise<string> {
  return runGit(["rev-parse", "--abbrev-ref", "HEAD"], ctx);
}

/** Return the fetch URL of a remote (defaults to `origin`). */
async function remoteUrl(remote = "origin", ctx?: GitContext): Promise<string> {
  return runGit(["remote", "get-url", remote], ctx);
}

async function mergeBase(ref: string, base: string, ctx?: GitContext): Promise<string> {
  return runGit(["merge-base", base, ref], ctx);
}

/**
 * Detect the repository's default branch.
 *
 * Prefers the remote's advertised default (`origin/HEAD`); falls back to a
 * local `main`/`master` if it exists, then to `"main"`.
 */
async function defaultBranch(ctx?: GitContext): Promise<string> {
  try {
    const ref = await runGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], ctx);
    return ref.replace(/^origin\//, "");
  } catch {
    for (const candidate of ["main", "master"]) {
      try {
        await runGit(["rev-parse", "--verify", "--quiet", candidate], ctx);
        return candidate;
      } catch {
        // try next candidate
      }
    }
    return "main";
  }
}

export type { GitContext };
export { currentBranch, defaultBranch, mergeBase, remoteUrl, runGit };
