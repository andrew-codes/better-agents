import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { MessageContent } from "@langchain/core/messages";
import { resolveModelOrDefault } from "@andrew-codes/better-agents-pkg-model";
import {
  CHARS_PER_TOKEN_ESTIMATE,
  annotateDiffWithLineNumbers,
  chunkDiffFiles,
  estimateTokens,
  partitionExcluded,
  splitDiffByFile,
} from "./diff.js";
import basePrompt from "./prompt.md";

/**
 * Default model name for the code-reviewer sub-agent. Review quality matters, so
 * this defaults to Sonnet rather than the lighter Haiku used by the metadata
 * sub-agents. Overridable via the central config.yml.
 */
const DEFAULT_MODEL = "opus-4.8";

/**
 * Soft budget for the diff payload alone, in estimated tokens. Conservative
 * relative to Claude's 200K context window — it leaves headroom for the
 * system prompt, PR metadata, prior-review/feedback text on revisions, and
 * the model's own output, and keeps each chunked pass focused enough to stay
 * coherent. Diffs that exceed it are reviewed in file-grouped chunks instead
 * of a single pass.
 */
const MAX_DIFF_TOKENS = 60_000;
const MAX_DIFF_CHARS = MAX_DIFF_TOKENS * CHARS_PER_TOKEN_ESTIMATE;

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
  /**
   * Optional sink for the model's live output. When supplied, the review is
   * generated via streaming and each reasoning/text delta is reported as it
   * arrives, letting the orchestrator surface the reviewer's "thinking state"
   * to the user. The full review is still returned when the stream completes.
   */
  onThought?: (delta: string) => void | Promise<void>;
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

/**
 * Split a streamed chunk's content into its visible text and its reasoning
 * ("thinking") deltas. Anthropic streams extended-thinking blocks as
 * `{ type: "thinking", thinking }` parts and answer tokens as
 * `{ type: "text", text }` parts; plain string content is treated as text.
 */
function splitChunk(content: MessageContent): { text: string; thinking: string } {
  if (typeof content === "string") return { text: content, thinking: "" };
  let text = "";
  let thinking = "";
  for (const part of content) {
    if (typeof part === "string") {
      text += part;
    } else if (part.type === "thinking" && "thinking" in part) {
      thinking += (part as { thinking?: string }).thinking ?? "";
    } else if ("text" in part) {
      text += part.text ?? "";
    }
  }
  return { text, thinking };
}

/**
 * Notes threaded into a review task: paths omitted from the diff and, when
 * the diff was too large for one pass, this pass's slice of it.
 */
interface TaskNotes {
  excludedPaths: readonly string[];
  scope?: { index: number; total: number; files: readonly string[] };
}

/** Render `notes` into a Markdown fragment for the task header, or `null` when there's nothing to say. */
function renderNotes(notes: TaskNotes): string | null {
  const lines: string[] = [];
  if (notes.scope) {
    const { index, total, files } = notes.scope;
    lines.push(
      `This diff was too large to review in one pass and was split by file. ` +
        `You are reviewing part ${index} of ${total}, covering: ${files.join(", ")}. ` +
        `Review only these files — other passes cover the rest.`,
    );
  }
  if (notes.excludedPaths.length) {
    lines.push(
      `These paths were omitted from the diff before review (generated dependency ` +
        `lockfiles and/or vendored Yarn PnP artifacts — not meaningful to review ` +
        `line-by-line): ${notes.excludedPaths.join(", ")}.`,
    );
  }
  return lines.length ? lines.join("\n") : null;
}

/** Build the human-message task for an initial review. */
function reviewTask(input: CodeReviewInput, notes: TaskNotes): string {
  const header = [
    input.title ? `PR title: ${input.title}` : null,
    input.baseRef ? `Diff base: ${input.baseRef}` : null,
    input.description ? `PR description:\n${input.description}` : null,
    renderNotes(notes),
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
function revisionTask(input: CodeReviewInput, notes: TaskNotes): string {
  const { priorReview, feedback } = input.revision!;
  return [
    "Revise your earlier code review to address the human reviewer's feedback.",
    "Keep everything that still applies; change only what the feedback calls for.",
    "Return the full revised review as Markdown.",
    renderNotes(notes),
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
  ]
    .filter(Boolean)
    .join("\n\n");
}

/** A chunk's reviewed files and the (Markdown) review produced for them. */
interface ChunkReview {
  files: readonly string[];
  review: string;
}

/** Stitch independently-produced chunk reviews into a single Markdown document. */
function combineChunkReviews(
  chunks: readonly ChunkReview[],
  excludedPaths: readonly string[],
): string {
  const notes = [
    `_This diff was large enough to require splitting into ${chunks.length} parts by ` +
      `file; each part below was reviewed independently and may repeat context._`,
    excludedPaths.length
      ? `_Omitted from review (generated lockfiles/vendored Yarn PnP artifacts): ` +
        `${excludedPaths.join(", ")}._`
      : null,
  ].filter((line): line is string => Boolean(line));

  const sections = chunks.map(
    (chunk, i) =>
      `## Part ${i + 1} of ${chunks.length} — ${chunk.files.join(", ")}\n\n${chunk.review}`,
  );

  return [...notes, ...sections].join("\n\n");
}

/**
 * Run a single review/revision pass: invoke the model (streaming through
 * `onThought` when supplied, otherwise a single blocking call) and return the
 * resulting Markdown.
 */
async function runPass(
  model: BaseChatModel,
  systemPrompt: string,
  task: string,
  onThought?: CodeReviewInput["onThought"],
): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: task },
  ];

  if (!onThought) {
    const result = await model.invoke(messages);
    return contentToString(result.content).trim();
  }

  // With a thought sink, stream so the reviewer's progress is observable.
  // Reasoning deltas and answer deltas are both reported; only the answer
  // text is accumulated into the returned review.
  //
  // Reasoning models (e.g. OpenAI's o*/gpt-5 family) emit no content at all
  // while "thinking" — the stream sits idle until the answer begins, which
  // can take a while and otherwise looks indistinguishable from a hang.
  // Emit an immediate progress note plus periodic heartbeats until the first
  // chunk arrives so the user knows the review is still in progress.
  await onThought("\n↪ Reviewing…\n");
  const heartbeat = setInterval(() => {
    void onThought("…");
  }, 15_000);

  let review = "";
  try {
    const stream = await model.stream(messages);
    for await (const chunk of stream) {
      clearInterval(heartbeat);
      const { text, thinking } = splitChunk(chunk.content);
      if (thinking) await onThought(thinking);
      if (text) {
        review += text;
        await onThought(text);
      }
    }
  } finally {
    clearInterval(heartbeat);
  }
  return review.trim();
}

/**
 * Create the code-reviewer sub-agent. Reviewing a diff needs no tools, so each
 * pass is a single model invocation whose system prompt fuses the base prompt
 * with the configured principles and tone.
 *
 * Before reviewing, the diff is split per file so that machine-generated
 * lockfiles and vendored Yarn PnP artifacts (see {@link partitionExcluded})
 * can be dropped — they're enormous, regenerated by tooling, and not
 * meaningful to review. If what remains still exceeds {@link MAX_DIFF_TOKENS},
 * it's reviewed in file-grouped chunks (see {@link chunkDiffFiles}) and the
 * partial reviews are stitched into one document.
 */
function createCodeReviewSubAgent(options: CodeReviewSubAgentOptions = {}): CodeReviewSubAgent {
  const model = options.model ?? resolveModelOrDefault(undefined, DEFAULT_MODEL);
  const systemPrompt = buildSystemPrompt(options);

  return {
    async review(input: CodeReviewInput) {
      const { kept, excludedPaths } = partitionExcluded(splitDiffByFile(input.diff));
      const filteredDiff = annotateDiffWithLineNumbers(kept.map((file) => file.text).join("\n"));

      if (estimateTokens(filteredDiff) <= MAX_DIFF_TOKENS) {
        const scopedInput = { ...input, diff: filteredDiff };
        const task = input.revision
          ? revisionTask(scopedInput, { excludedPaths })
          : reviewTask(scopedInput, { excludedPaths });
        return runPass(model, systemPrompt, task, input.onThought);
      }

      // Too large for one pass: review file-grouped chunks independently and
      // stitch the partial reviews into a single document.
      const chunks = chunkDiffFiles(kept, MAX_DIFF_CHARS);
      const reviews: ChunkReview[] = [];
      for (const [i, chunk] of chunks.entries()) {
        const files = [...new Set(chunk.map((file) => file.path))];
        const scope = { index: i + 1, total: chunks.length, files };
        if (input.onThought) {
          await input.onThought(
            `\n↪ Reviewing part ${scope.index}/${scope.total}: ${files.join(", ")}\n`,
          );
        }
        const chunkInput = {
          ...input,
          diff: annotateDiffWithLineNumbers(chunk.map((file) => file.text).join("\n")),
        };
        const task = input.revision
          ? revisionTask(chunkInput, { excludedPaths, scope })
          : reviewTask(chunkInput, { excludedPaths, scope });
        reviews.push({ files, review: await runPass(model, systemPrompt, task, input.onThought) });
      }
      return combineChunkReviews(reviews, excludedPaths);
    },
  };
}

export type { CodeReviewInput, CodeReviewSubAgent, CodeReviewSubAgentOptions };
export { DEFAULT_MODEL, MAX_DIFF_TOKENS, createCodeReviewSubAgent };
