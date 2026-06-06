/** A stdio MCP server spec plus the read-only tools we expose from it. */
interface ProviderMcp {
  /** Logical server name used as the MCP namespace. */
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  /**
   * Allowlist of tool names to expose. The plan requires read-only access to
   * repo and PR *metadata* only — diff/file-content tools are deliberately
   * excluded so the diff is only ever produced locally via `git diff`.
   */
  allowedTools: string[];
}

export type { ProviderMcp };
