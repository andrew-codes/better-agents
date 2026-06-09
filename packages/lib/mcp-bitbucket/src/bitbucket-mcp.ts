import type { McpServerSpec } from "@andrew-codes/better-agents-pkg-mcp-utils";
import type { BitbucketProviderConfig } from "./types.js";

/** Atlassian's official remote MCP server (Rovo). Reached via the `mcp-remote` stdio proxy. */
const ROVO_MCP_URL = "https://mcp.atlassian.com/v1/mcp";

/**
 * Build the Bitbucket MCP server spec using Atlassian's **official** Rovo MCP
 * server (https://support.atlassian.com/bitbucket-cloud/docs/interacting-with-bitbucket-via-mcp/).
 *
 * The Rovo server is remote, so it is launched through the `mcp-remote` stdio
 * proxy — keeping the stdio `McpServerSpec` shape the rest of the system
 * expects. Bitbucket Cloud tools authenticate with an Atlassian account email +
 * API token passed as a Basic `Authorization` header (OAuth is not yet
 * available for the Bitbucket tools; org admins must enable API-token auth on
 * the Rovo server).
 *
 * Note: the Rovo server exposes no line-anchored inline-comment tool, so
 * posting inline review comments is done directly against the Bitbucket REST
 * API by the feedback publisher — not through this MCP server.
 *
 * The caller supplies `allowedTools` — what should be exposed depends on the
 * consumer's purpose (read-only metadata vs. posting), not on the provider.
 */
function bitbucketMcp(config: BitbucketProviderConfig, allowedTools: string[]): McpServerSpec {
  const basic = Buffer.from(`${config.email}:${config.apiToken}`).toString("base64");
  return {
    name: "bitbucket",
    command: "npx",
    args: ["-y", "mcp-remote@latest", ROVO_MCP_URL, "--header", `Authorization: Basic ${basic}`],
    env: {},
    allowedTools,
  };
}

export { bitbucketMcp };
