import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { BaseMessage, BaseMessageLike } from "@langchain/core/messages";
import type { RunnableConfig } from "@langchain/core/runnables";
import { createAgent } from "langchain";
import { resolveModelOrDefault } from "@andrew-codes/better-agents-pkg-model";
import type { GitContext } from "./git.js";
import systemPrompt from "./prompt.md";
import { createGitTools } from "./tools.js";

/** Default model name for the git sub-agent. Overridable via the central config. */
const DEFAULT_MODEL = "haiku-4.5";

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
}

/**
 * Create the git sub-agent: a ReAct agent equipped with read-oriented git
 * tools and an empty system prompt (behaviour is driven entirely by the
 * task message the orchestrator sends).
 */
function createGitSubAgent(options: GitSubAgentOptions = {}): GitSubAgent {
  const model = options.model ?? resolveModelOrDefault(undefined, DEFAULT_MODEL);

  return createAgent({
    model,
    tools: createGitTools(options.git),
    // The plan mandates an empty system prompt for this sub-agent.
    systemPrompt: systemPrompt || undefined,
  });
}

export type { GitSubAgent, GitSubAgentOptions };
export { DEFAULT_MODEL, createGitSubAgent };
