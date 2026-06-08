import type { RunnableConfig } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { bitbucketMcp } from "@andrew-codes/better-agents-pkg-mcp-bitbucket";
import { githubMcp } from "@andrew-codes/better-agents-pkg-mcp-github";
import { scopeTools, type McpServerSpec } from "@andrew-codes/better-agents-pkg-mcp-utils";
import type { ProviderConfig } from "@andrew-codes/better-agents-pkg-types-git-provider";
import { parseReview } from "./parse.js";
import { publishToBitbucket, publishToGitHub } from "./post.js";
import { readReviewFile } from "./review-file.js";

/**
 * Write-capable PR comment / review tools to expose — enough to post feedback,
 * nothing that edits code, pushes commits, or merges the PR.
 *
 * Posting is deterministic (see `post.ts`): GitHub uses one
 * `create_pull_request_review` carrying the summary, the verdict and every
 * inline comment; Bitbucket uses `addPullRequestComment` per finding.
 */
const ALLOWED_TOOLS: Record<ProviderConfig["type"], string[]> = {
  github: [
    "get_pull_request",
    "create_pull_request_review",
    // Fallback only, for feedback with no file/line to anchor to.
    "add_issue_comment",
  ],
  bitbucket: ["getPullRequest", "addPullRequestComment"],
};

/** Build the MCP server spec for the configured provider, scoped to `ALLOWED_TOOLS`. */
function buildProviderMcp(provider: ProviderConfig): McpServerSpec {
  return provider.type === "github"
    ? githubMcp(provider, ALLOWED_TOOLS.github)
    : bitbucketMcp(provider, ALLOWED_TOOLS.bitbucket);
}

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
   * Defaults to `process.cwd()`.
   */
  repoRoot?: string;
}

interface FeedbackPublisherSubAgent {
  /**
   * Read the approved review at `reviewFilePath`, parse it deterministically,
   * and post it to `target` as a pull-request review: the summary as the review
   * body, each located finding as an inline comment on its cited file/line, and
   * a request-changes verdict when the review contains blocking findings.
   * Returns a short human-readable summary of what was posted. `config` is
   * accepted for API compatibility but no longer drives a model.
   */
  publish(
    input: { reviewFilePath: string; target: PublishTarget },
    config?: RunnableConfig,
  ): Promise<string>;
  /** Disconnect the underlying MCP server subprocess. */
  close(): Promise<void>;
}

/**
 * Create the pr-review-feedback-publisher sub-agent. Despite the name, posting
 * is **deterministic**: the approved review Markdown is parsed in code and the
 * provider's PR-review API is called directly with a constructed payload. This
 * removes the model from the mechanical posting step, so inline-comment
 * placement and the request-changes verdict are reliable regardless of any
 * model used elsewhere in the pipeline. Construction is async because the
 * provider's MCP tools are loaded over the wire.
 */
async function createFeedbackPublisherSubAgent(
  options: FeedbackPublisherOptions,
): Promise<FeedbackPublisherSubAgent> {
  const mcp = buildProviderMcp(options.provider);

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
      const markdown = await readReviewFile(reviewFilePath, options.repoRoot);
      const parsed = parseReview(markdown);

      if (!parsed.summary && parsed.findings.length === 0 && parsed.unlocated.length === 0) {
        throw new Error(`Review file "${reviewFilePath}" has no summary or findings to publish.`);
      }

      const result =
        options.provider.type === "github"
          ? await publishToGitHub(tools, target, parsed)
          : await publishToBitbucket(tools, target, parsed, options.provider.workspace);

      return result.message;
    },
    async close() {
      await client.close();
    },
  };
}

export type { FeedbackPublisherOptions, FeedbackPublisherSubAgent, PublishTarget };
export { ALLOWED_TOOLS, createFeedbackPublisherSubAgent };
