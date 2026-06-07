/** A stdio MCP server spec plus the tools a caller has chosen to expose from it. */
interface McpServerSpec {
  /** Logical server name used as the MCP namespace. */
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  /** Allowlist of tool names to expose, supplied by the caller. */
  allowedTools: string[];
}

export type { McpServerSpec };
