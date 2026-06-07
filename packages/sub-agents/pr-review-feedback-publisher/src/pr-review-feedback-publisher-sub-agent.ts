import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";
import { resolveModelOrDefault } from "@andrew-codes/better-agents-pkg-model";
import { bitbucketMcp } from "./providers/bitbucket.js";
import { githubMcp } from "./providers/github.js";
import type { ProviderMcp } from "./providers/types.js";
import systemPrompt from "./prompt.md";
import { createFileTools } from "./tools.js";
import type { ProviderConfig } from "./types.js";

/** Default model name for the feedback-publisher sub-agent. Overridable via config. */
const DEFAULT_MODEL = "haiku-4.5";

/** Where to post: the minimal PR coordinates the publisher needs. */
interface PublishTarget {
  /** Numeric PR number (GitHub) or id (Bitbucket). */
  number: number;
  /** PR web URL — the publisher derives owner/repo (or workspace/repo) from it. */
  url: string;
  /** PR title, for the agent's context. */
  title?: string;
}

interface FeedbackPublisherOptions {
  /** Resolved provider configuration (github or bitbucket). */
  provider: ProviderConfig;
  /**
   * Chat model to drive the sub-agent. Defaults to Anthropic Haiku 4.5; the
   * top-level agent passes an override resolved from the central config.yml.
   */
  model?: BaseChatModel;
  /**
   * Repository root the review file lives under. Reads are confined to it.
   * Defaults to `process.cwd()`.
   */
  repoRoot?: string;
}

interface FeedbackPublisherSubAgent {
  /**
   * Read the approved review at `reviewFilePath` and post it to `target` as a
   * review comment on the pull request. Returns the agent's final message.
   */
  publish(input: { reviewFilePath: string; target: PublishTarget }): Promise<string>;
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

/** Coerce the agent's final message content into a plain string. */
function finalText(result: { messages: Array<{ content: unknown }> }): string {
  const last = result.messages[result.messages.length - 1];
  const content = last?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) =>
        typeof part === "string"
          ? part
          : part && typeof part === "object" && "text" in part
            ? String((part as { text: unknown }).text)
            : "",
      )
      .join("");
  }
  return "";
}

/**
 * Create the pr-review-feedback-publisher sub-agent: a ReAct agent wired to the
 * provider's write-capable MCP server (scoped to PR comment/review tools) plus a
 * repo-confined file-read tool. Construction is async because MCP tools are
 * loaded over the wire.
 */
async function createFeedbackPublisherSubAgent(
  options: FeedbackPublisherOptions,
): Promise<FeedbackPublisherSubAgent> {
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

  const mcpTools = scopeTools(
    (await client.getTools()) as StructuredToolInterface[],
    mcp.allowedTools,
  );
  const tools = [...createFileTools(options.repoRoot), ...mcpTools];

  const model = options.model ?? resolveModelOrDefault(undefined, DEFAULT_MODEL);

  const agent = createAgent({
    model,
    tools,
    systemPrompt: systemPrompt || undefined,
  });

  return {
    async publish({ reviewFilePath, target }) {
      const task =
        `Publish the approved code review to the ${options.provider.type} pull ` +
        `request #${target.number} (${target.url}).\n` +
        (target.title ? `PR title: ${target.title}\n` : "") +
        `The approved review file is at "${reviewFilePath}". Read it with ` +
        `read_review_file, extract the reviewer feedback, and post it to the PR ` +
        `as a single review comment using the provider's tools. Derive the ` +
        `repository owner/name (or workspace/repo) from the PR URL.`;

      const result = await agent.invoke({
        messages: [{ role: "user", content: task }],
      });
      return finalText(result as { messages: Array<{ content: unknown }> });
    },
    async close() {
      await client.close();
    },
  };
}

export type { FeedbackPublisherOptions, FeedbackPublisherSubAgent, PublishTarget };
export { DEFAULT_MODEL, createFeedbackPublisherSubAgent };
