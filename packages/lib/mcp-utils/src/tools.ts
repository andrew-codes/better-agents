import type { StructuredToolInterface } from "@langchain/core/tools";

/** Restrict a set of MCP tools to an explicit allowlist of tool names. */
function scopeTools(
  tools: StructuredToolInterface[],
  allowed: string[],
): StructuredToolInterface[] {
  const allowedNames = new Set(allowed);
  return tools.filter((tool) => allowedNames.has(tool.name));
}

export { scopeTools };
