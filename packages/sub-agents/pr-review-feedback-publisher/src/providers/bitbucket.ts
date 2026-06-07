import type { BitbucketProviderConfig } from "../types.js";
import type { ProviderMcp } from "./types.js";

/**
 * Build the Bitbucket MCP server spec for publishing review feedback using the
 * `bitbucket-mcp` package (https://www.npmjs.com/package/bitbucket-mcp).
 *
 * Credentials come from config.yml or the corresponding env vars and are passed
 * through to the server subprocess.
 *
 * The allowlist is limited to PR comment creation plus the read tool needed to
 * locate the PR. Tool names track the `bitbucket-mcp` package; adjust if a
 * different server version exposes different names.
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
    allowedTools: ["getPullRequest", "addPullRequestComment"],
  };
}

export { bitbucketMcp };
