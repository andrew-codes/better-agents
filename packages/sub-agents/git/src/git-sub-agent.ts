import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { StructuredToolInterface } from "@langchain/core/tools";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";
import { gitMcp } from "@andrew-codes/better-agents-pkg-mcp-git";
import { scopeTools } from "@andrew-codes/better-agents-pkg-mcp-utils";
import { resolveModelOrDefault } from "@andrew-codes/better-agents-pkg-model";
import {
  currentBranch,
  defaultBranch,
  diff,
  remoteUrl,
  type DiffOptions,
  type GitContext,
} from "./git.js";
import systemPrompt from "./prompt.md";
import { createGitTools } from "./tools.js";

/** Default model name for the git sub-agent. Overridable via the central config. */
const DEFAULT_MODEL = "haiku-4.5";

/**
 * Tools delegated to the official Git MCP server
 * (https://mcpservers.org/servers/modelcontextprotocol/git) rather than
 * implemented by hand. Only tools with no overlapping range/symmetric-diff
 * requirements are delegated — `git_diff` and `git_log` stay custom because
 * the MCP server's versions can't express `base...head` / `base..head` ranges,
 * which the orchestrator depends on.
 */
const MCP_ALLOWED_TOOLS = ["git_status"];

interface GitSubAgentOptions {
  /**
   * Chat model to drive the sub-agent. When omitted, the default model
   * (Haiku 4.5) is constructed. The top-level agent passes an override
   * resolved from the central config.yml when one is configured.
   */
  model?: BaseChatModel;
  /** Working directory for git commands (defaults to process.cwd()). */
  git?: GitContext;
}

/** Minimal invokable surface of the git sub-agent used by callers. */
interface GitSubAgent {
  invoke(
    input: { messages: BaseMessageLike[] },
    config?: RunnableConfig,
  ): Promise<{ messages: BaseMessage[] }>;
  /**
   * Deterministic git operations that run the git CLI directly, with no model
   * round-trip. Preferred over {@link invoke} for the orchestrator's fixed
   * steps — especially `diff`, whose (potentially large) output must never be
   * fed back through a model just to be read.
   */
  currentBranch(): Promise<string>;
  defaultBranch(): Promise<string>;
  /** Fetch URL of a git remote (defaults to 'origin'). */
  remoteUrl(remote?: string): Promise<string>;
  diff(options?: DiffOptions): Promise<string>;
  /** Disconnect the underlying MCP server subprocess. */
  close(): Promise<void>;
}

/**
 * Create the git sub-agent.
 *
 * The deterministic methods (`currentBranch`, `defaultBranch`, `remoteUrl`,
 * `diff`) run the git CLI directly and cover the orchestrator's needs without a
 * model or any subprocess. The ReAct layer behind `invoke` — a model equipped
 * with read-oriented git tools, some delegated to the official Git MCP server —
 * is built lazily on first `invoke`, so the common (direct-method) path spawns
 * neither a model nor the MCP subprocess.
 */
async function createGitSubAgent(options: GitSubAgentOptions = {}): Promise<GitSubAgent> {
  // Lazily-initialized ReAct agent + its MCP client; created on first `invoke`.
  let client: MultiServerMCPClient | null = null;
  let agentPromise: Promise<ReturnType<typeof createAgent>> | null = null;

  const ensureAgent = (): Promise<ReturnType<typeof createAgent>> => {
    if (!agentPromise) {
      agentPromise = (async () => {
        const repository = options.git?.cwd ?? process.cwd();
        const mcp = gitMcp({ repository }, MCP_ALLOWED_TOOLS);

        client = new MultiServerMCPClient({
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
        const tools = [...createGitTools(options.git), ...mcpTools];
        const model = options.model ?? resolveModelOrDefault(undefined, DEFAULT_MODEL);

        return createAgent({
          model,
          tools,
          // The plan mandates an empty system prompt for this sub-agent.
          systemPrompt: systemPrompt || undefined,
        });
      })();
    }
    return agentPromise;
  };

  return {
    invoke: async (input, config) => (await ensureAgent()).invoke(input, config),
    currentBranch: () => currentBranch(options.git),
    defaultBranch: () => defaultBranch(options.git),
    remoteUrl: (remote) => remoteUrl(remote, options.git),
    diff: (diffOptions) => diff(diffOptions, options.git),
    async close() {
      // Only the lazily-created ReAct layer holds a subprocess to tear down.
      if (client) await client.close();
    },
  };
}

export type { GitSubAgent, GitSubAgentOptions };
export { DEFAULT_MODEL, createGitSubAgent };
