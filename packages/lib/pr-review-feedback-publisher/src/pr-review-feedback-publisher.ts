import type { RunnableConfig } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { githubMcp } from "@andrew-codes/better-agents-pkg-mcp-github";
import { scopeTools } from "@andrew-codes/better-agents-pkg-mcp-utils";
import type { ProviderConfig } from "@andrew-codes/better-agents-pkg-types-git-provider";
import { parseReview } from "./parse.js";
import { publishToBitbucket, publishToGitHub } from "./post.js";
import { readReviewFile } from "./review-file.js";

/**
 * Write-capable GitHub PR review tools to expose — enough to post feedback,
 * nothing that edits code, pushes commits, or merges the PR.
 *
 * Posting is deterministic (see `post.ts`): GitHub uses one
 * `create_pull_request_review` carrying the summary, the verdict and every
 * inline comment. Bitbucket does not appear here — the official Rovo MCP server
 * has no line-anchored inline-comment tool, so the Bitbucket path posts
 * directly against the Bitbucket REST API instead of through an MCP server.
 */
const ALLOWED_TOOLS = {
  github: [
    "get_pull_request",
    "create_pull_request_review",
    // Fallback only, for feedback with no file/line to anchor to.
    "add_issue_comment",
  ],
} as const;

/** Where to post: the minimal PR coordinates the publisher needs. */
interface PublishTarget {
  /** Numeric PR number (GitHub) or id (Bitbucket). */
  number: number;
  /** PR web URL — the publisher derives owner/repo (or workspace/repo) from it. */
  url: string;
  /** PR title, for logging context. */
  title?: string;
}

interface FeedbackPublisherOptions {
  /** Resolved provider configuration (github or bitbucket). */
  provider: ProviderConfig;
  /**
   * Repository root the review file lives under. Reads are confined to it.
   * The `process.cwd()` default is applied downstream in `readReviewFile`.
   */
  repoRoot?: string;
}

interface FeedbackPublisher {
  /**
   * Read the approved review at `reviewFilePath`, parse it deterministically,
   * and post it to `target` as a pull-request review: the summary as the review
   * body, each located finding as an inline comment on its cited file/line, and
   * a request-changes verdict when the review contains blocking findings.
   * Returns a short human-readable summary of what was posted. `config` is
   * accepted for API compatibility but no model is involved.
   */
  publish(
    input: { reviewFilePath: string; target: PublishTarget },
    config?: RunnableConfig,
  ): Promise<string>;
  /** Disconnect the underlying MCP server subprocess, if any. */
  close(): Promise<void>;
}

/**
 * Create the PR-review feedback publisher. Despite the historical "sub-agent"
 * name, this is **not** an agent: posting is deterministic. The approved review
 * Markdown is parsed in code and the PR is updated with a constructed payload,
 * so inline-comment placement and the request-changes verdict are reliable
 * regardless of any model used elsewhere in the pipeline.
 *
 *  - **GitHub** posts one review via the official GitHub MCP server's
 *    `create_pull_request_review` (summary as body, verdict as event, findings
 *    as inline comments). Construction connects to that MCP server over stdio.
 *  - **Bitbucket** posts directly against the Bitbucket REST API — the official
 *    Rovo MCP server exposes no line-anchored inline-comment tool, so no MCP
 *    server is started for this provider and `close()` is a no-op.
 */
async function createFeedbackPublisher(
  options: FeedbackPublisherOptions,
): Promise<FeedbackPublisher> {
  const { provider, repoRoot } = options;

  const readParsed = async (reviewFilePath: string) => {
    const markdown = await readReviewFile(reviewFilePath, repoRoot);
    const parsed = parseReview(markdown);
    if (!parsed.summary && parsed.findings.length === 0 && parsed.unlocated.length === 0) {
      throw new Error(`Review file "${reviewFilePath}" has no summary or findings to publish.`);
    }
    return parsed;
  };

  // Bitbucket: no MCP server — post straight to the REST API.
  if (provider.type === "bitbucket") {
    return {
      async publish({ reviewFilePath, target }) {
        const parsed = await readParsed(reviewFilePath);
        const result = await publishToBitbucket(provider, target, parsed);
        return result.message;
      },
      async close() {},
    };
  }

  // GitHub: connect to the official GitHub MCP server, scoped to write tools.
  const mcp = githubMcp(provider, [...ALLOWED_TOOLS.github]);
  const client = new MultiServerMCPClient({
    mcpServers: {
      [mcp.name]: {
        transport: "stdio",
        command: mcp.command,
        args: mcp.args,
        env: mcp.env,
      },
    },
  });

  const tools = scopeTools(
    (await client.getTools()) as StructuredToolInterface[],
    mcp.allowedTools,
  );

  return {
    async publish({ reviewFilePath, target }) {
      const parsed = await readParsed(reviewFilePath);
      const result = await publishToGitHub(tools, target, parsed);
      return result.message;
    },
    async close() {
      await client.close();
    },
  };
}

export type { FeedbackPublisher, FeedbackPublisherOptions, PublishTarget };
export { ALLOWED_TOOLS, createFeedbackPublisher };
