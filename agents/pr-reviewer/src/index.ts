import { Readable, Writable } from "node:stream";
import {
  AgentSideConnection,
  ndJsonStream,
  PROTOCOL_VERSION,
  type Agent,
  type AuthenticateRequest,
  type CancelNotification,
  type InitializeRequest,
  type InitializeResponse,
  type NewSessionRequest,
  type NewSessionResponse,
  type PromptRequest,
  type PromptResponse,
} from "@zed-industries/agent-client-protocol";
import { applyAgentEnv, loadConfig } from "./config/load.js";
import { createPrReviewer, type ReviewResult } from "./pr-reviewer-agent.js";
import instructions from "./prompt.md";

/** Render the gathered review context as a human-readable message. */
function summarize(result: ReviewResult): string {
  const lines: string[] = [];
  lines.push(`Branch: ${result.branch || "(unknown)"}`);
  if (result.pr) {
    lines.push(
      `PR #${result.pr.number}: ${result.pr.title}`,
      `  ${result.pr.url}`,
      `  ${result.pr.author} — ${result.pr.sourceBranch} → ${result.pr.targetBranch}` +
        ` (${result.pr.state}${result.pr.isDraft ? ", draft" : ""})`,
    );
  } else {
    lines.push("No open pull request found for this branch.");
  }
  lines.push("", `Diff (base ${result.baseRef}):`, result.diff || "(empty)");
  return lines.join("\n");
}

/**
 * ACP agent. Each prompt turn runs the pr-reviewer workflow against the current
 * branch and streams the gathered branch/PR/diff context back to the client.
 *
 * Conforms to the Agent Client Protocol (`@zed-industries/agent-client-protocol`).
 */
class PrReviewerAgent implements Agent {
  constructor(private readonly conn: AgentSideConnection) {}

  async initialize(_params: InitializeRequest): Promise<InitializeResponse> {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { promptCapabilities: { image: false, audio: false } },
    };
  }

  async newSession(_params: NewSessionRequest): Promise<NewSessionResponse> {
    return { sessionId: `pr-reviewer-${Date.now()}` };
  }

  async authenticate(_params: AuthenticateRequest): Promise<void> {
    // No agent-side auth method is advertised; provider credentials are
    // supplied via config.yml / environment variables.
  }

  async cancel(_params: CancelNotification): Promise<void> {
    // The workflow is a short, non-interruptible batch; nothing to cancel.
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    const config = await loadConfig();
    applyAgentEnv(config);

    const reviewer = await createPrReviewer(config);
    try {
      const result = await reviewer.review();
      await this.conn.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: summarize(result) },
        },
      });
      return { stopReason: "end_turn" };
    } finally {
      await reviewer.close();
    }
  }
}

/** Expose the agent over ACP via stdio (newline-delimited JSON). */
function main(): void {
  void instructions; // system prompt, inlined at build time.
  const output = Writable.toWeb(process.stdout) as WritableStream<Uint8Array>;
  const input = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
  const stream = ndJsonStream(output, input);
  new AgentSideConnection((conn) => new PrReviewerAgent(conn), stream);
}

main();

export { createPrReviewer } from "./pr-reviewer-agent.js";
export type { PrReviewer, ReviewResult } from "./pr-reviewer-agent.js";
export { loadConfig } from "./config/load.js";
