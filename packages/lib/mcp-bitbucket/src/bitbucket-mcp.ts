import type { McpServerSpec } from "@andrew-codes/better-agents-pkg-mcp-utils";
import type { BitbucketProviderConfig } from "./types.js";

/**
 * Build the Bitbucket MCP server spec using the `bitbucket-mcp` package
 * (https://www.npmjs.com/package/bitbucket-mcp).
 *
 * Credentials (username, workspace, token) come from config.yml or the
 * corresponding env vars and are passed through to the server subprocess.
 *
 * The caller supplies `allowedTools` — what should be exposed depends on the
 * sub-agent's purpose (read-only metadata vs. posting feedback), not on the
 * provider itself.
 */
function bitbucketMcp(config: BitbucketProviderConfig, allowedTools: string[]): McpServerSpec {
  return {
    name: "bitbucket",
    command: "npx",
    args: ["-y", "bitbucket-mcp"],
    env: {
      BITBUCKET_USERNAME: config.username,
      BITBUCKET_WORKSPACE: config.workspace,
      BITBUCKET_TOKEN: config.token,
    },
    allowedTools,
  };
}

export { bitbucketMcp };
