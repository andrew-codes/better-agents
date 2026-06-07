import type { GitHubProviderConfig } from "../types.js";
import type { ProviderMcp } from "./types.js";

/**
 * Build the GitHub MCP server spec for publishing review feedback.
 *
 * Uses the official GitHub MCP server (the same server the pr-identification
 * sub-agent reads from). Authentication is via a personal access token mapped
 * onto the env var the server expects.
 *
 * The allowlist is limited to PR comment / review creation plus the read tool
 * needed to locate the PR. Nothing that edits code or merges the PR is exposed.
 */
function githubMcp(config: GitHubProviderConfig): ProviderMcp {
  return {
    name: "github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: config.token,
    },
    allowedTools: [
      "get_pull_request",
      "create_pull_request_review",
      "add_pull_request_review_comment",
      "add_issue_comment",
    ],
  };
}

export { githubMcp };
