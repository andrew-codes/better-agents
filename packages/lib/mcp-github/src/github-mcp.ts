import type { McpServerSpec } from "@andrew-codes/better-agents-pkg-mcp-utils";
import type { GitHubProviderConfig } from "./types.js";

/**
 * Build the GitHub MCP server spec.
 *
 * Uses the official GitHub MCP server. Authentication is via a personal access
 * token; the resolved token (config.yml or the GITHUB_TOKEN env var) is mapped
 * onto the env var the server expects.
 *
 * The caller supplies `allowedTools` — what should be exposed depends on the
 * sub-agent's purpose (read-only metadata vs. posting feedback), not on the
 * provider itself.
 */
function githubMcp(config: GitHubProviderConfig, allowedTools: string[]): McpServerSpec {
  return {
    name: "github",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: {
      GITHUB_PERSONAL_ACCESS_TOKEN: config.token,
    },
    allowedTools,
  };
}

export { githubMcp };
