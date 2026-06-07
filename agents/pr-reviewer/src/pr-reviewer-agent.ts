import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BaseMessage } from "@langchain/core/messages";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ProviderConfig } from "@andrew-codes/better-agents-pkg-types-git-provider";
import { resolveModel } from "@andrew-codes/better-agents-pkg-model";
import {
  createCodeReviewSubAgent,
  type CodeReviewSubAgent,
} from "@andrew-codes/better-agents-pkg-sub-agent-code-reviewer";
import { createGitSubAgent } from "@andrew-codes/better-agents-pkg-sub-agent-git";
import {
  createPrIdentificationSubAgent,
  type PrDetails,
  type PrIdentificationSubAgent,
} from "@andrew-codes/better-agents-pkg-sub-agent-pr-identification";
import {
  createFeedbackPublisherSubAgent,
  type FeedbackPublisherSubAgent,
} from "@andrew-codes/better-agents-pkg-sub-agent-pr-review-feedback-publisher";
import { annotate } from "@andrew-codes/better-agents-pkg-plannotator";
import type { GitProviderCredentials, PrReviewerConfig } from "./config/schema.js";

/** Guard against an endless annotate/revise loop if approval never comes. */
const MAX_REVISION_ROUNDS = 10;

interface ReviewResult {
  branch: string;
  pr: PrDetails | null;
  /** Local unified diff produced by `git diff` (never fetched from the host). */
  diff: string;
  baseRef: string;
  /** The (possibly revised) code review Markdown. */
  review: string;
  /** Path the review file was written to, or "" when not written. */
  reviewPath: string;
  /** Whether the human approved the review via plannotator. */
  approved: boolean;
  /** The publisher's confirmation, or "" when nothing was published. */
  published: string;
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

/** Resolve a provider configuration from a credentials block + env fallbacks. */
function resolveProvider(creds: GitProviderCredentials | undefined): ProviderConfig {
  const provider = creds?.gitProvider ?? "github";

  if (provider === "bitbucket") {
    return {
      type: "bitbucket",
      username: creds?.bitbucket?.username ?? process.env.BITBUCKET_USERNAME ?? "",
      workspace: creds?.bitbucket?.workspace ?? process.env.BITBUCKET_WORKSPACE ?? "",
      token: creds?.bitbucket?.token ?? process.env.BITBUCKET_TOKEN ?? "",
    };
  }

  return {
    type: "github",
    token: creds?.github?.token ?? process.env.GITHUB_TOKEN ?? "",
  };
}

/** Today's date as YYYY-MM-DD. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Build the review file path: tmp/reviews/<PR-ID>-YYYY-MM-DD.md. */
function reviewFilePath(state: { pr: PrDetails | null; branch: string }): string {
  const id = state.pr
    ? String(state.pr.number)
    : state.branch.replace(/[^\w.-]+/g, "-") || "review";
  return join(process.cwd(), "tmp", "reviews", `${id}-${today()}.md`);
}

const ReviewState = Annotation.Root({
  branch: Annotation<string>,
  pr: Annotation<PrDetails | null>,
  diff: Annotation<string>,
  baseRef: Annotation<string>,
  review: Annotation<string>,
  reviewPath: Annotation<string>,
  approved: Annotation<boolean>,
  published: Annotation<string>,
});

interface PrReviewer {
  /** Run the workflow against the current branch and return the gathered context. */
  review(): Promise<ReviewResult>;
  /** Tear down sub-agent resources (MCP subprocesses). */
  close(): Promise<void>;
}

/**
 * Build the pr-reviewer orchestrator: a LangGraph workflow whose steps are each
 * delegated to a dedicated sub-agent.
 *
 *   detectBranch (git)
 *     -> identifyPr (pr-identification)   # PR metadata only, no diff
 *     -> computeDiff (git)                # local `git diff`
 *     -> reviewCode (code-reviewer)       # comprehensive review of the diff
 *     -> annotateReview (plannotator)     # human review/revise/approve loop
 *     -> publishFeedback (pr-review-feedback-publisher)  # only when approved
 *
 * The PR's code diff is always produced locally via the git sub-agent — the
 * pr-identification sub-agent only returns PR metadata.
 */
async function createPrReviewer(config: PrReviewerConfig): Promise<PrReviewer> {
  const subAgents = config.config?.subAgents;

  // The repository is always the current working directory.
  const gitSubAgent = await createGitSubAgent({
    model: resolveModel(subAgents?.git?.model),
    git: { cwd: process.cwd() },
  });

  const prSubAgent: PrIdentificationSubAgent = await createPrIdentificationSubAgent({
    provider: resolveProvider(subAgents?.prIdentification),
    model: resolveModel(subAgents?.prIdentification?.model),
  });

  const codeReviewSubAgent: CodeReviewSubAgent = createCodeReviewSubAgent({
    model: resolveModel(subAgents?.codeReviewer?.model),
    principles: subAgents?.codeReviewer?.principles,
    tone: subAgents?.codeReviewer?.tone,
  });

  const publisherSubAgent: FeedbackPublisherSubAgent = await createFeedbackPublisherSubAgent({
    provider: resolveProvider(subAgents?.feedbackPublisher),
    model: resolveModel(subAgents?.feedbackPublisher?.model),
    repoRoot: process.cwd(),
  });

  const detectBranch = async () => {
    const res = await gitSubAgent.invoke({
      messages: [
        {
          role: "user",
          content: "Determine the current git branch using your tools and report only its name.",
        },
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
          {
            role: "user",
            content:
              "Determine the repository's default branch using your tools and report only its name.",
          },
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

  const reviewCode = async (state: typeof ReviewState.State) => {
    const review = await codeReviewSubAgent.review({
      diff: state.diff,
      title: state.pr?.title,
      description: state.pr?.description,
      baseRef: state.baseRef,
    });
    return { review };
  };

  // Write the review to a file and run the plannotator human-in-the-loop gate.
  // On "annotated" feedback the code-reviewer revises and we re-present; on
  // "approved" we stop with the approved file; on "dismissed" we stop unpublished.
  const annotateReview = async (state: typeof ReviewState.State) => {
    const path = reviewFilePath(state);
    await mkdir(dirname(path), { recursive: true });

    let review = state.review;
    for (let round = 0; round < MAX_REVISION_ROUNDS; round++) {
      await writeFile(path, review, "utf8");
      const outcome = await annotate(path);

      if (outcome.kind === "approved") {
        return { review, reviewPath: path, approved: true };
      }
      if (outcome.kind === "dismissed") {
        return { review, reviewPath: path, approved: false };
      }
      // "annotated": revise to address the human feedback, then re-present.
      review = await codeReviewSubAgent.review({
        diff: state.diff,
        title: state.pr?.title,
        description: state.pr?.description,
        baseRef: state.baseRef,
        revision: { priorReview: review, feedback: outcome.feedback },
      });
    }

    // Ran out of revision rounds without an explicit decision: persist and stop.
    await writeFile(path, review, "utf8");
    return { review, reviewPath: path, approved: false };
  };

  const publishFeedback = async (state: typeof ReviewState.State) => {
    if (!state.pr) {
      return { published: "" };
    }
    const published = await publisherSubAgent.publish({
      reviewFilePath: state.reviewPath,
      target: { number: state.pr.number, url: state.pr.url, title: state.pr.title },
    });
    return { published };
  };

  // After the gate, only publish when the human approved.
  const afterAnnotate = (state: typeof ReviewState.State) =>
    state.approved ? "publishFeedback" : END;

  const graph = new StateGraph(ReviewState)
    .addNode("detectBranch", detectBranch)
    .addNode("identifyPr", identifyPr)
    .addNode("computeDiff", computeDiff)
    .addNode("reviewCode", reviewCode)
    .addNode("annotateReview", annotateReview)
    .addNode("publishFeedback", publishFeedback)
    .addEdge(START, "detectBranch")
    .addEdge("detectBranch", "identifyPr")
    .addEdge("identifyPr", "computeDiff")
    .addEdge("computeDiff", "reviewCode")
    .addEdge("reviewCode", "annotateReview")
    .addConditionalEdges("annotateReview", afterAnnotate, {
      publishFeedback: "publishFeedback",
      [END]: END,
    })
    .addEdge("publishFeedback", END)
    .compile();

  return {
    async review() {
      const final = await graph.invoke({
        branch: "",
        pr: null,
        diff: "",
        baseRef: "",
        review: "",
        reviewPath: "",
        approved: false,
        published: "",
      });
      return {
        branch: final.branch,
        pr: final.pr,
        diff: final.diff,
        baseRef: final.baseRef,
        review: final.review,
        reviewPath: final.reviewPath,
        approved: final.approved,
        published: final.published,
      };
    },
    async close() {
      await gitSubAgent.close();
      await prSubAgent.close();
      await publisherSubAgent.close();
    },
  };
}

export type { PrReviewer, ReviewResult };
export { createPrReviewer };
