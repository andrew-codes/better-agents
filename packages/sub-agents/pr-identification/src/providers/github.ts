import type { GitHubProviderConfig } from "../types.js";
import type { ProviderMcp } from "./types.js";

/**
 * Build the GitHub MCP server spec.
 *
 * Uses the official GitHub MCP server. Authentication is via a personal access
 * token; the resolved token (config.yml or the GITHUB_TOKEN env var) is mapped
 * onto the env var the server expects.
 *
 * Only read-only PR and repository metadata tools are allowlisted. Tools that
 * would return file contents or diffs are intentionally omitted.
 */
function githubMcp(config: GitHubProviderConfig): ProviderMcp {
  return {
    name: "github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: config.token,
    },
    allowedTools: ["list_pull_requests", "get_pull_request", "search_repositories"],
  };
}

export { githubMcp };
