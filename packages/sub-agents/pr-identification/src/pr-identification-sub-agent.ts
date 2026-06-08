import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";
import { bitbucketMcp } from "@andrew-codes/better-agents-pkg-mcp-bitbucket";
import { githubMcp } from "@andrew-codes/better-agents-pkg-mcp-github";
import { scopeTools, type McpServerSpec } from "@andrew-codes/better-agents-pkg-mcp-utils";
import { resolveModelOrDefault } from "@andrew-codes/better-agents-pkg-model";
import type { ProviderConfig } from "@andrew-codes/better-agents-pkg-types-git-provider";
import systemPrompt from "./prompt.md";
import { prDetailsSchema, type PrDetails } from "./types.js";

/** Default model name for the PR-identification sub-agent. Overridable via config. */
const DEFAULT_MODEL = "haiku-4.5";

/**
 * Read-only PR/repo metadata tools to expose. No tool that returns file
 * contents or diffs is allowlisted — the diff is computed locally by the
 * top-level agent via `git diff`.
 */
const ALLOWED_TOOLS: Record<ProviderConfig["type"], string[]> = {
  github: ["list_pull_requests", "get_pull_request", "search_repositories"],
  bitbucket: ["getPullRequests", "getPullRequest", "getRepository"],
};

/** Build the MCP server spec for the configured provider, scoped to `ALLOWED_TOOLS`. */
function buildProviderMcp(provider: ProviderConfig): McpServerSpec {
  return provider.type === "github"
    ? githubMcp(provider, ALLOWED_TOOLS.github)
    : bitbucketMcp(provider, ALLOWED_TOOLS.bitbucket);
}

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
   * the top-level agent via `git diff`. `config` is forwarded to the underlying
   * ReAct agent (e.g. to attach callbacks for progress reporting).
   */
  identifyPr(branch: string, config?: RunnableConfig): Promise<PrDetails | null>;
  /** Disconnect the underlying MCP server subprocess. */
  close(): Promise<void>;
}

/**
 * Create the PR-identification sub-agent: a ReAct agent wired to the provider's
 * MCP server (scoped to read-only PR/repo metadata) with an empty system
 * prompt. Construction is async because MCP tools are loaded over the wire.
 */
async function createPrIdentificationSubAgent(
  options: PrIdentificationOptions,
): Promise<PrIdentificationSubAgent> {
  const mcp = buildProviderMcp(options.provider);

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
    async identifyPr(branch: string, config?: RunnableConfig) {
      const task =
        `Find the open ${options.provider.type} pull request whose source ` +
        `(head) branch is exactly "${branch}". Use only the available tools ` +
        `to look up repository and pull request metadata. Do NOT fetch the ` +
        `code diff or file contents. If no matching open PR exists, say so. ` +
        `Return the details of the identified pull request; do not include ` +
        `any code diff or file contents in the response.`;

      const result = await agent.invoke(
        {
          messages: [{ role: "user", content: task }],
        },
        config,
      );

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
