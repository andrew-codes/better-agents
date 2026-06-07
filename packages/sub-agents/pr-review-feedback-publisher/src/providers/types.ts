/** A stdio MCP server spec plus the write tools we expose from it. */
interface ProviderMcp {
  /** Logical server name used as the MCP namespace. */
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  /**
   * Allowlist of tool names to expose. Unlike the pr-identification sub-agent
   * (read-only metadata), this sub-agent needs the provider's *write* tools so
   * it can post review feedback to the pull request. Only PR-comment / review
   * tools are allowlisted — nothing that mutates code or merges the PR.
   */
  allowedTools: string[];
}

export type { ProviderMcp };
