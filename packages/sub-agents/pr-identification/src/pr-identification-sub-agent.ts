import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";
import { resolveModelOrDefault } from "@andrew-codes/better-agents-pkg-model";
import { bitbucketMcp } from "./providers/bitbucket.js";
import { githubMcp } from "./providers/github.js";
import type { ProviderMcp } from "./providers/types.js";
import systemPrompt from "./prompt.md";
import { prDetailsSchema, type PrDetails, type ProviderConfig } from "./types.js";

/** Default model name for the PR-identification sub-agent. Overridable via config. */
const DEFAULT_MODEL = "haiku-4.5";

interface PrIdentificationOptions {
  /** Resolved provider configuration (github or bitbucket). */
  provider: ProviderConfig;
  /**
   * Chat model to drive the sub-agent. Defaults to Anthropic Haiku 4.5; the
   * top-level agent passes an override resolved from the central config.yml.
   */
  model?: BaseChatModel;
}

interface PrIdentificationSubAgent {
  /**
   * Identify the open PR whose source branch matches `branch` and return its
   * details. The code diff is never fetched here — it is computed locally by
   * the top-level agent via `git diff`.
   */
  identifyPr(branch: string): Promise<PrDetails | null>;
  /** Disconnect the underlying MCP server subprocess. */
  close(): Promise<void>;
}

function providerMcp(provider: ProviderConfig): ProviderMcp {
  return provider.type === "github" ? githubMcp(provider) : bitbucketMcp(provider);
}

/** Keep only the tools whose (possibly server-prefixed) name is allowlisted. */
function scopeTools(
  tools: StructuredToolInterface[],
  allowed: string[],
): StructuredToolInterface[] {
  return tools.filter((t) =>
    allowed.some((name) => t.name === name || t.name.endsWith(`__${name}`)),
  );
}

/**
 * Create the PR-identification sub-agent: a ReAct agent wired to the provider's
 * MCP server (scoped to read-only PR/repo metadata) with an empty system
 * prompt. Construction is async because MCP tools are loaded over the wire.
 */
async function createPrIdentificationSubAgent(
  options: PrIdentificationOptions,
): Promise<PrIdentificationSubAgent> {
  const mcp = providerMcp(options.provider);

  const client = new MultiServerMCPClient({
    mcpServers: {
      [mcp.name]: {
        transport: "stdio",
        command: mcp.command,
        args: mcp.args,
        env: mcp.env,
      },
    },
  });

  const allTools = (await client.getTools()) as StructuredToolInterface[];
  const tools = scopeTools(allTools, mcp.allowedTools);

  const model = options.model ?? resolveModelOrDefault(undefined, DEFAULT_MODEL);

  const agent = createAgent({
    model,
    tools,
    // The plan mandates an empty system prompt for this sub-agent.
    systemPrompt: systemPrompt || undefined,
    responseFormat: prDetailsSchema,
  });

  return {
    async identifyPr(branch: string) {
      const task =
        `Find the open ${options.provider.type} pull request whose source ` +
        `(head) branch is exactly "${branch}". Use only the available tools ` +
        `to look up repository and pull request metadata. Do NOT fetch the ` +
        `code diff or file contents. If no matching open PR exists, say so. ` +
        `Return the details of the identified pull request; do not include ` +
        `any code diff or file contents in the response.`;

      const result = await agent.invoke({
        messages: [{ role: "user", content: task }],
      });

      const structured = (result.structuredResponse ?? undefined) as PrDetails | undefined;
      return structured ?? null;
    },
    async close() {
      await client.close();
    },
  };
}

export type { PrIdentificationOptions, PrIdentificationSubAgent };
export { DEFAULT_MODEL, createPrIdentificationSubAgent };
