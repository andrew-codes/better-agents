import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { MessageContent } from "@langchain/core/messages";
import { resolveModelOrDefault } from "@andrew-codes/better-agents-pkg-model";
import basePrompt from "./prompt.md";

/**
 * Default model name for the code-reviewer sub-agent. Review quality matters, so
 * this defaults to Sonnet rather than the lighter Haiku used by the metadata
 * sub-agents. Overridable via the central config.yml.
 */
const DEFAULT_MODEL = "opus-4.8";

interface CodeReviewSubAgentOptions {
  /**
   * Chat model to drive the review. Defaults to {@link DEFAULT_MODEL}; the
   * top-level agent passes an override resolved from the central config.yml.
   */
  model?: BaseChatModel;
  /**
   * Review principles the reviewer must follow, sourced from the pr-reviewer
   * agent's config. Combined with the base system prompt. A list is rendered as
   * bullet points; a string is used verbatim.
   */
  principles?: string | string[];
  /**
   * Desired tone of the feedback, sourced from the pr-reviewer agent's config.
   * Combined with the base system prompt.
   */
  tone?: string;
}

/** Context the orchestrator supplies for a single review. */
interface CodeReviewInput {
  /** The local unified diff to review (produced via `git diff`). */
  diff: string;
  /** PR title, if known, for orienting the reviewer. */
  title?: string;
  /** PR description, if known. */
  description?: string;
  /** Base/target branch the diff is computed against. */
  baseRef?: string;
  /**
   * A prior review and the human feedback gathered on it. When present, the
   * reviewer revises the prior review to address the feedback rather than
   * producing a fresh review from scratch.
   */
  revision?: {
    priorReview: string;
    feedback: string;
  };
}

interface CodeReviewSubAgent {
  /** Review the supplied diff and return the review as Markdown. */
  review(input: CodeReviewInput): Promise<string>;
}

/** Render the configured principles into a Markdown fragment. */
function renderPrinciples(principles: string | string[] | undefined): string {
  if (!principles) return "";
  if (Array.isArray(principles)) {
    return principles.map((p) => `- ${p}`).join("\n");
  }
  return principles;
}

/**
 * Combine the base system prompt with the configured review principles and tone
 * to form the sub-agent's effective system prompt.
 */
function buildSystemPrompt(options: CodeReviewSubAgentOptions): string {
  const sections = [basePrompt];

  const principles = renderPrinciples(options.principles);
  if (principles.trim()) {
    sections.push(`## Review principles\n\n${principles.trim()}`);
  }

  if (options.tone?.trim()) {
    sections.push(`## Tone\n\nWrite the feedback in this tone:\n\n${options.tone.trim()}`);
  }

  return sections.join("\n\n");
}

/** Coerce a LangChain message content union into a plain string. */
function contentToString(content: MessageContent): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => (typeof part === "string" ? part : "text" in part ? part.text : ""))
    .join("");
}

/** Build the human-message task for an initial review. */
function reviewTask(input: CodeReviewInput): string {
  const header = [
    input.title ? `PR title: ${input.title}` : null,
    input.baseRef ? `Diff base: ${input.baseRef}` : null,
    input.description ? `PR description:\n${input.description}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "Review the following pull request.",
    header,
    "Unified diff:",
    "```diff",
    input.diff || "(empty diff)",
    "```",
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** Build the human-message task for a revision pass. */
function revisionTask(input: CodeReviewInput): string {
  const { priorReview, feedback } = input.revision!;
  return [
    "Revise your earlier code review to address the human reviewer's feedback.",
    "Keep everything that still applies; change only what the feedback calls for.",
    "Return the full revised review as Markdown.",
    "Your earlier review:",
    "```markdown",
    priorReview,
    "```",
    "Human feedback to address:",
    feedback,
    "For reference, the diff under review:",
    "```diff",
    input.diff || "(empty diff)",
    "```",
  ].join("\n\n");
}

/**
 * Create the code-reviewer sub-agent. Reviewing a diff needs no tools, so this
 * is a single model invocation whose system prompt fuses the base prompt with
 * the configured principles and tone.
 */
function createCodeReviewSubAgent(options: CodeReviewSubAgentOptions = {}): CodeReviewSubAgent {
  const model = options.model ?? resolveModelOrDefault(undefined, DEFAULT_MODEL);
  const systemPrompt = buildSystemPrompt(options);

  return {
    async review(input: CodeReviewInput) {
      const task = input.revision ? revisionTask(input) : reviewTask(input);
      const result = await model.invoke([
        { role: "system", content: systemPrompt },
        { role: "user", content: task },
      ]);
      return contentToString(result.content).trim();
    },
  };
}

export type { CodeReviewInput, CodeReviewSubAgent, CodeReviewSubAgentOptions };
export { DEFAULT_MODEL, createCodeReviewSubAgent };
