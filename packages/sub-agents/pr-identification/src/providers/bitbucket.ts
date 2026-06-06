import type { BitbucketProviderConfig } from "../types.js";
import type { ProviderMcp } from "./types.js";

/**
 * Build the Bitbucket MCP server spec using the `bitbucket-mcp` package
 * (https://www.npmjs.com/package/bitbucket-mcp).
 *
 * Credentials (username, workspace, token) come from config.yml or the
 * corresponding env vars and are passed through to the server subprocess.
 *
 * Only read-only PR and repository lookup tools are allowlisted.
 */
function bitbucketMcp(config: BitbucketProviderConfig): ProviderMcp {
  return {
    name: "bitbucket",
    command: "npx",
    args: ["-y", "bitbucket-mcp"],
    env: {
      BITBUCKET_USERNAME: config.username,
      BITBUCKET_WORKSPACE: config.workspace,
      BITBUCKET_TOKEN: config.token,
    },
    allowedTools: ["getPullRequests", "getPullRequest", "getRepository"],
  };
}

export { bitbucketMcp };
