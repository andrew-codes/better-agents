import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import type { Serialized } from "@langchain/core/load/serializable";
import type { LLMResult } from "@langchain/core/outputs";

/** Sink for reasoning/output text streamed out of a model run. */
type ThoughtSink = (text: string) => void | Promise<void>;

/** Concatenate the text of every generation in an LLM result. */
function llmResultText(output: LLMResult): string {
  let text = "";
  for (const batch of output.generations ?? []) {
    for (const generation of batch) {
      if (generation.text) text += generation.text;
    }
  }
  return text;
}

/** Best-effort human-readable name for a tool from its callback metadata. */
function toolName(tool: Serialized, runName?: string): string {
  if (runName) return runName;
  const id = (tool as { id?: unknown }).id;
  if (Array.isArray(id) && id.length > 0) return String(id[id.length - 1]);
  return "tool";
}

/**
 * LangChain callback handler that surfaces a model run's "thinking state" by
 * forwarding it to a {@link ThoughtSink}. Used to give ReAct sub-agents (which
 * are invoked, not streamed directly) the same live-progress visibility the
 * orchestrator gives the streaming code-reviewer.
 *
 *  - Streamed token deltas are forwarded as they arrive (requires the model to
 *    be in streaming mode; {@link resolveModel} enables this by default).
 *  - If a run produced no token deltas, its full output text is forwarded once
 *    when the run ends, so non-streaming models still report something.
 *  - Each tool invocation is announced, so tool-only turns (which emit no
 *    natural-language text) still show what the agent is doing.
 */
class ThoughtCallbackHandler extends BaseCallbackHandler {
  name = "thought-stream";

  /** Run ids that emitted at least one token delta, to avoid double-reporting. */
  private readonly streamed = new Set<string>();

  constructor(private readonly sink: ThoughtSink) {
    super();
  }

  async handleLLMNewToken(token: string, _idx: unknown, runId: string): Promise<void> {
    if (!token) return;
    this.streamed.add(runId);
    await this.sink(token);
  }

  async handleLLMEnd(output: LLMResult, runId: string): Promise<void> {
    if (this.streamed.delete(runId)) return; // already reported incrementally
    const text = llmResultText(output);
    if (text) await this.sink(text);
  }

  async handleToolStart(
    tool: Serialized,
    _input: string,
    _runId: string,
    _parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    runName?: string,
  ): Promise<void> {
    await this.sink(`\n↪ ${toolName(tool, runName)}\n`);
  }
}

/** Create a {@link ThoughtCallbackHandler} that forwards to `sink`. */
function createThoughtCallback(sink: ThoughtSink): ThoughtCallbackHandler {
  return new ThoughtCallbackHandler(sink);
}

export type { ThoughtSink };
export { ThoughtCallbackHandler, createThoughtCallback };
