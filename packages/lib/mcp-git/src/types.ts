/** Configuration for the local-repository Git MCP server. */
interface GitMcpConfig {
  /** Absolute path to the git repository the server should operate on. */
  repository: string;
}

export type { GitMcpConfig };
