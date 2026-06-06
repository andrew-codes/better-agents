import type { BaseMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { createGitSubAgent } from "@andrew-codes/better-agents-pkg-sub-agent-git";
import {
  createPrIdentificationSubAgent,
  type PrDetails,
  type PrIdentificationSubAgent,
  type ProviderConfig,
} from "@andrew-codes/better-agents-pkg-sub-agent-pr-identification";
import { resolveModel } from "@andrew-codes/better-agents-pkg-model";
import type { PrReviewerConfig } from "./config/schema.js";

export interface ReviewResult {
  branch: string;
  pr: PrDetails | null;
  /** Local unified diff produced by `git diff` (never fetched from the host). */
  diff: string;
  baseRef: string;
}

/** Pull the exact output of a named tool call out of a ReAct agent result. */
function toolOutput(result: { messages: BaseMessage[] }, toolName: string): string | null {
  for (let i = result.messages.length - 1; i >= 0; i--) {
    const m = result.messages[i];
    if (m.getType() === "tool" && (m as { name?: string }).name === toolName) {
      return typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    }
  }
  return null;
}

/** Resolve the provider configuration from config.yml values + env fallbacks. */
function resolveProvider(config: PrReviewerConfig): ProviderConfig {
  const pi = config.config?.subAgents?.prIdentification;
  const provider = pi?.gitProvider ?? "github";

  if (provider === "bitbucket") {
    return {
      type: "bitbucket",
      username: pi?.bitbucket?.username ?? process.env.BITBUCKET_USERNAME ?? "",
      workspace: pi?.bitbucket?.workspace ?? process.env.BITBUCKET_WORKSPACE ?? "",
      token: pi?.bitbucket?.token ?? process.env.BITBUCKET_TOKEN ?? "",
    };
  }

  return {
    type: "github",
    token: pi?.github?.token ?? process.env.GITHUB_TOKEN ?? "",
  };
}

const ReviewState = Annotation.Root({
  branch: Annotation<string>,
  pr: Annotation<PrDetails | null>,
  diff: Annotation<string>,
  baseRef: Annotation<string>,
});

export interface PrReviewer {
  /** Run the workflow against the current branch and return the gathered context. */
  review(): Promise<ReviewResult>;
  /** Tear down sub-agent resources (MCP subprocesses). */
  close(): Promise<void>;
}

/**
 * Build the pr-reviewer orchestrator: a LangGraph workflow whose steps are each
 * delegated to a dedicated sub-agent.
 *
 *   detectBranch (git) -> identifyPr (pr-identification) -> computeDiff (git)
 *
 * The PR's code diff is always produced locally via the git sub-agent — the
 * pr-identification sub-agent only returns PR metadata.
 */
export async function createPrReviewer(config: PrReviewerConfig): Promise<PrReviewer> {
  // The repository is always the current working directory.
  const gitSubAgent = createGitSubAgent({
    model: resolveModel(config.config?.subAgents?.git?.model),
    git: { cwd: process.cwd() },
  });

  const prSubAgent: PrIdentificationSubAgent = await createPrIdentificationSubAgent({
    provider: resolveProvider(config),
    model: resolveModel(config.config?.subAgents?.prIdentification?.model),
  });

  const detectBranch = async () => {
    const res = await gitSubAgent.invoke({
      messages: [
        { role: "user", content: "Determine the current git branch using your tools and report only its name." },
      ],
    });
    const branch = (toolOutput(res, "git_current_branch") ?? "").trim();
    return { branch };
  };

  const identifyPr = async (state: typeof ReviewState.State) => {
    const pr = await prSubAgent.identifyPr(state.branch);
    return { pr };
  };

  const computeDiff = async (state: typeof ReviewState.State) => {
    // Prefer the PR's target branch; otherwise detect the repo's default branch.
    let base = state.pr?.targetBranch;
    if (!base) {
      const detect = await gitSubAgent.invoke({
        messages: [
          { role: "user", content: "Determine the repository's default branch using your tools and report only its name." },
        ],
      });
      base = (toolOutput(detect, "git_default_branch") ?? "").trim() || "main";
    }
    const head = state.pr?.sourceBranch ?? state.branch;
    const res = await gitSubAgent.invoke({
      messages: [
        {
          role: "user",
          content: `Produce the unified diff for the range ${base}...${head} using your tools.`,
        },
      ],
    });
    return { diff: toolOutput(res, "git_diff") ?? "", baseRef: base };
  };

  const graph = new StateGraph(ReviewState)
    .addNode("detectBranch", detectBranch)
    .addNode("identifyPr", identifyPr)
    .addNode("computeDiff", computeDiff)
    .addEdge(START, "detectBranch")
    .addEdge("detectBranch", "identifyPr")
    .addEdge("identifyPr", "computeDiff")
    .addEdge("computeDiff", END)
    .compile();

  return {
    async review() {
      const final = await graph.invoke({ branch: "", pr: null, diff: "", baseRef: "" });
      return {
        branch: final.branch,
        pr: final.pr,
        diff: final.diff,
        baseRef: final.baseRef,
      };
    },
    async close() {
      await prSubAgent.close();
    },
  };
}
