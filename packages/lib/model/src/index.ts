import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatOpenAI } from "@langchain/openai";

/** A model selection: a name plus arbitrary provider-specific options. */
interface ModelConfig {
  name: string;
  [option: string]: unknown;
}

/** The default model used by sub-agents when no override is configured. */
const DEFAULT_MODEL_NAME = "sonnet-4.6";

/** Friendly model names mapped to concrete Anthropic model ids. */
const ANTHROPIC_ALIASES: Record<string, string> = {
  "haiku-4.5": "claude-haiku-4-5-20251001",
  "sonnet-4.6": "claude-sonnet-4-6",
  "opus-4.8": "claude-opus-4-8",
};

function isOpenAi(name: string): boolean {
  return /^(gpt-|o\d)/i.test(name);
}

/**
 * Resolve a `ModelConfig` into a concrete LangChain chat model. Supports
 * Anthropic (default) and OpenAI. Extra keys under `model` are forwarded as
 * provider-specific options. Returns `undefined` when no model name is given.
 */
function resolveModel(config: ModelConfig | undefined): BaseChatModel | undefined {
  if (!config?.name) return undefined;

  const { name, ...options } = config;

  if (isOpenAi(name)) {
    return new ChatOpenAI({ model: name, ...options });
  }

  const model = ANTHROPIC_ALIASES[name] ?? name;
  return new ChatAnthropic({ model, ...options });
}

/**
 * Resolve a model, falling back to a default model name when `config` is
 * absent. Always returns a usable chat model.
 */
function resolveModelOrDefault(
  config: ModelConfig | undefined,
  fallbackName: string = DEFAULT_MODEL_NAME,
): BaseChatModel {
  return resolveModel(config) ?? resolveModel({ name: fallbackName })!;
}

export type { ModelConfig };
export { DEFAULT_MODEL_NAME, resolveModel, resolveModelOrDefault };
