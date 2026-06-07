import type { McpServerSpec } from "@andrew-codes/better-agents-pkg-mcp-utils";
import type { GitMcpConfig } from "./types.js";

/**
 * Build the MCP server spec for the official local-repository Git server
 * (https://mcpservers.org/servers/modelcontextprotocol/git).
 *
 * Run via `uvx mcp-server-git`, pointed at the target repository with
 * `--repository`. Operates entirely on the local working tree — no host
 * credentials are required.
 *
 * The caller supplies `allowedTools` — what should be exposed depends on the
 * sub-agent's purpose (read-only inspection vs. staging/committing).
 */
function gitMcp(config: GitMcpConfig, allowedTools: string[]): McpServerSpec {
  return {
    name: "git",
    command: "uvx",
    args: ["mcp-server-git", "--repository", config.repository],
    env: {},
    allowedTools,
  };
}

export { gitMcp };
