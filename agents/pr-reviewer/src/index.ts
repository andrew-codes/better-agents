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
  if (result.stopReason) {
    lines.push("", result.stopReason);
    return lines.join("\n");
  }
  // Past the stopReason check, identifyPr guarantees a PR was found.
  if (!result.pr) {
    throw new Error("Invariant violation: pr is null after stopReason check");
  }
  const pr = result.pr;
  lines.push(
    `PR #${pr.number}: ${pr.title}`,
    `  ${pr.url}`,
    `  ${pr.author} — ${pr.sourceBranch} → ${pr.targetBranch}` +
      ` (${pr.state}${pr.isDraft ? ", draft" : ""})`,
  );
  lines.push("", `Diff (base ${result.baseRef}):`, result.diff || "(empty)");
  lines.push("");
  if (result.reviewPath) {
    lines.push(`Review written to: ${result.reviewPath}`);
  }
  lines.push(`Approved: ${result.approved ? "yes" : "no"}`);
  if (result.published) {
    lines.push("", "Published feedback:", result.published);
  } else {
    lines.push("Not published (review was not approved).");
  }
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
      // Stream progress as the workflow runs: each step becomes a visible
      // message line and the reviewer's live reasoning becomes a thought chunk,
      // so the client (e.g. Zed) shows activity instead of a blank turn.
      const result = await reviewer.review(async (event) => {
        await this.conn.sessionUpdate({
          sessionId: params.sessionId,
          update:
            event.type === "step"
              ? {
                  sessionUpdate: "agent_message_chunk",
                  content: { type: "text", text: `\n### ${event.label}\n` },
                }
              : {
                  sessionUpdate: "agent_thought_chunk",
                  content: { type: "text", text: event.text },
                },
        });
      });
      await this.conn.sessionUpdate({
        sessionId: params.sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: `\n${summarize(result)}` },
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
