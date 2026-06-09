import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RunnableConfig } from "@langchain/core/runnables";
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import type { ProviderConfig } from "@andrew-codes/better-agents-pkg-types-git-provider";
import { createThoughtCallback, resolveModel } from "@andrew-codes/better-agents-pkg-model";
import {
  createCodeReviewSubAgent,
  type CodeReviewSubAgent,
} from "@andrew-codes/better-agents-pkg-sub-agent-code-reviewer";
import { createGitSubAgent, parseRepoSlug } from "@andrew-codes/better-agents-pkg-sub-agent-git";
import {
  createPrIdentificationSubAgent,
  type PrDetails,
  type PrIdentificationSubAgent,
  type RepoCoordinates,
} from "@andrew-codes/better-agents-pkg-sub-agent-pr-identification";
import {
  createFeedbackPublisher,
  type FeedbackPublisher,
} from "@andrew-codes/better-agents-pkg-pr-review-feedback-publisher";
import { annotate } from "@andrew-codes/better-agents-pkg-plannotator";
import type { GitProviderCredentials, PrReviewerConfig } from "./config/schema.js";

/** Guard against an endless annotate/revise loop if approval never comes. */
const MAX_REVISION_ROUNDS = 10;

interface ReviewResult {
  branch: string;
  pr: PrDetails | null;
  /**
   * Set when the workflow stopped early (no PR found, or local commits not yet
   * pushed) instead of running the review. Empty when the workflow ran to
   * completion.
   */
  stopReason: string;
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

/** Resolve a provider configuration from a credentials block + env fallbacks. */
function resolveProvider(creds: GitProviderCredentials | undefined): ProviderConfig {
  const provider = creds?.gitProvider ?? "github";

  if (provider === "bitbucket") {
    return {
      type: "bitbucket",
      workspace: creds?.bitbucket?.workspace ?? process.env.BITBUCKET_WORKSPACE ?? "",
      email: creds?.bitbucket?.email ?? process.env.BITBUCKET_EMAIL ?? "",
      apiToken: creds?.bitbucket?.apiToken ?? process.env.BITBUCKET_API_TOKEN ?? "",
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
  /** Repo coordinates parsed from the local git remote, or null when unavailable. */
  repo: Annotation<RepoCoordinates | null>,
  pr: Annotation<PrDetails | null>,
  /** Set when the workflow stops early; routes every gated edge straight to END. */
  stopReason: Annotation<string>,
  diff: Annotation<string>,
  baseRef: Annotation<string>,
  review: Annotation<string>,
  reviewPath: Annotation<string>,
  approved: Annotation<boolean>,
  published: Annotation<string>,
});

/**
 * Progress emitted while a review runs, so callers (e.g. the ACP layer) can
 * surface what the agent is doing and its live reasoning.
 *
 *  - `step`: a workflow stage has begun — the "what step it is on" signal.
 *  - `thought`: a streamed reasoning/output delta — the "thinking state" signal.
 */
type ReviewEvent =
  | { type: "step"; step: string; label: string }
  | { type: "thought"; text: string };

/** Sink for {@link ReviewEvent}s; awaited so updates flush in order. */
type ReviewEventHandler = (event: ReviewEvent) => void | Promise<void>;

interface PrReviewer {
  /**
   * Run the workflow against the current branch and return the gathered
   * context. When `onEvent` is supplied, step and thinking-state updates are
   * reported as the workflow progresses.
   */
  review(onEvent?: ReviewEventHandler): Promise<ReviewResult>;
  /** Tear down sub-agent resources (MCP subprocesses). */
  close(): Promise<void>;
}

/**
 * Build the pr-reviewer orchestrator: a LangGraph workflow whose steps are each
 * delegated to a dedicated sub-agent.
 *
 *   detectBranch (git)
 *     -> fetchRemote (git)                 # bring origin/<branch> & origin/<default> up to date
 *     -> checkLocalAhead (git)             # stop if local has unpushed commits
 *     -> identifyPr (pr-identification)    # PR metadata only, no diff; stop if none found
 *     -> computeDiff (git)                 # local `git diff` against remote-tracking refs
 *     -> reviewCode (code-reviewer)        # comprehensive review of the diff
 *     -> annotateReview (plannotator)      # human review/revise/approve loop
 *     -> publishFeedback (pr-review-feedback-publisher)  # only when approved; deletes the review file after
 *
 * The PR's code diff is always produced locally via the git sub-agent — the
 * pr-identification sub-agent only returns PR metadata.
 *
 * `fetchRemote`, `checkLocalAhead`, and `identifyPr` can each set `stopReason`
 * on the state, in which case the workflow ends immediately without reviewing:
 * no PR for the branch, or local commits that haven't been pushed.
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

  const publisher: FeedbackPublisher = await createFeedbackPublisher({
    provider: resolveProvider(subAgents?.feedbackPublisher),
    repoRoot: process.cwd(),
  });

  // Set per-`review()` call; nodes report progress through it. Defaults to a
  // no-op so the workflow runs unchanged when no handler is supplied.
  let emit: ReviewEventHandler = () => {};

  // Forwards the ReAct sub-agents' streamed reasoning and tool activity as
  // thought events. The handler closes over `emit`, so it always targets the
  // current review's handler. Passed via each sub-agent invocation's config.
  const reactConfig: RunnableConfig = {
    callbacks: [createThoughtCallback((text) => emit({ type: "thought", text }))],
  };

  // Detect both the current branch and the repo coordinates (parsed from the
  // local git remote). The remote tells us exactly which repository to look the
  // PR up in, so the pr-identification sub-agent never has to search.
  const detectBranch = async () => {
    await emit({ type: "step", step: "detectBranch", label: "Detecting current branch" });
    // Deterministic git lookups: run the CLI directly, with no model round-trip.
    const branch = (await gitSubAgent.currentBranch()).trim();
    const remote = (await gitSubAgent.remoteUrl().catch(() => "")).trim();
    const repo = remote ? parseRepoSlug(remote) : null;
    return { branch, repo };
  };

  // Bring the remote-tracking refs for the current branch and the default
  // branch up to date before anything else runs, so the ahead-check and the
  // diff both compare against what's actually on the remote — not whatever a
  // stale `origin/*` ref happened to point to last time something fetched.
  const fetchRemote = async (state: typeof ReviewState.State) => {
    await emit({ type: "step", step: "fetchRemote", label: "Fetching latest from remote" });
    if (!state.repo) {
      return {};
    }
    const remoteDefault = (await gitSubAgent.defaultBranch()).trim() || "main";
    const refs = Array.from(new Set([state.branch, remoteDefault].filter(Boolean)));
    // Use explicit refspecs so the remote-tracking refs (origin/<branch>) are
    // always written, regardless of the repo's configured fetch refspec.
    const refspecs = refs.map((r) => `${r}:refs/remotes/origin/${r}`);
    await gitSubAgent.fetchRefs(refspecs);
    return {};
  };

  // A review can only reflect commits that have been pushed. If the local
  // branch holds commits the remote doesn't have, the PR (and the diff we'd
  // compute) wouldn't match what the human is sitting on — stop and say so.
  const checkLocalAhead = async (state: typeof ReviewState.State) => {
    await emit({ type: "step", step: "checkLocalAhead", label: "Checking for unpushed commits" });
    if (!state.repo) {
      return {};
    }
    const remoteBranch = `origin/${state.branch}`;
    const ahead = await gitSubAgent.aheadCount(state.branch, remoteBranch);
    if (ahead) {
      return {
        stopReason:
          `Your local branch "${state.branch}" is ${ahead} commit${ahead === 1 ? "" : "s"} ` +
          `ahead of "${remoteBranch}". Push your local commits first — the pull request ` +
          "(and this review) can only reflect what's been pushed.",
      };
    }
    return {};
  };

  const identifyPr = async (state: typeof ReviewState.State) => {
    await emit({ type: "step", step: "identifyPr", label: "Identifying pull request" });
    // Without repo coordinates we cannot scope the lookup, so no PR can be found.
    const pr = state.repo
      ? await prSubAgent.identifyPr(state.branch, state.repo, reactConfig)
      : null;
    if (!pr) {
      return {
        pr: null,
        stopReason: `No open pull request was found for branch "${state.branch}". Open one and try again.`,
      };
    }
    return { pr };
  };

  const computeDiff = async (state: typeof ReviewState.State) => {
    await emit({ type: "step", step: "computeDiff", label: "Computing diff" });
    // The diff must reflect what's actually on the remote — i.e. what the PR
    // contains — not local refs that may be stale relative to `origin`.
    // Deterministic git operations run the CLI directly — the (potentially huge)
    // diff must never be fed back through a model just to be read, which would
    // overflow the context window. Generated lockfiles and Yarn PnP artifacts
    // are excluded by `diff` itself.
    const baseName = state.pr?.targetBranch || (await gitSubAgent.defaultBranch()).trim() || "main";
    const headName = state.pr?.sourceBranch || state.branch;
    const base = `origin/${baseName}`;
    const head = `origin/${headName}`;
    let diff: string;
    try {
      diff = await gitSubAgent.diff({ base, head });
    } catch {
      return {
        stopReason:
          `Could not compute diff between "${base}" and "${head}". ` +
          `Make sure the source branch has been pushed to the remote.`,
      };
    }
    return { diff, baseRef: base };
  };

  const reviewCode = async (state: typeof ReviewState.State) => {
    await emit({ type: "step", step: "reviewCode", label: "Reviewing code" });
    const review = await codeReviewSubAgent.review({
      diff: state.diff,
      title: state.pr?.title,
      description: state.pr?.description,
      baseRef: state.baseRef,
      onThought: (text) => emit({ type: "thought", text }),
    });
    return { review };
  };

  // Write the review to a file and run the plannotator human-in-the-loop gate.
  // On "annotated" feedback the code-reviewer revises and we re-present; on
  // "approved" we stop with the approved file; on "dismissed" we stop unpublished.
  const annotateReview = async (state: typeof ReviewState.State) => {
    await emit({ type: "step", step: "annotateReview", label: "Awaiting human review" });
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
      await emit({ type: "step", step: "reviseReview", label: "Revising review" });
      review = await codeReviewSubAgent.review({
        diff: state.diff,
        title: state.pr?.title,
        description: state.pr?.description,
        baseRef: state.baseRef,
        revision: { priorReview: review, feedback: outcome.feedback },
        onThought: (text) => emit({ type: "thought", text }),
      });
    }

    // Ran out of revision rounds without an explicit decision: persist and stop.
    await writeFile(path, review, "utf8");
    return { review, reviewPath: path, approved: false };
  };

  // Reaching this node requires an approved review, which in turn requires a
  // PR (identifyPr stops the workflow otherwise) — `state.pr` is always set.
  const publishFeedback = async (state: typeof ReviewState.State) => {
    await emit({ type: "step", step: "publishFeedback", label: "Publishing feedback" });
    const pr = state.pr as PrDetails;
    const published = await publisher.publish(
      {
        reviewFilePath: state.reviewPath,
        target: { number: pr.number, url: pr.url, title: pr.title },
      },
      reactConfig,
    );
    // The review file only exists to drive the human review/annotate gate;
    // once its contents have been posted to the PR, remove it from disk.
    if (state.reviewPath) {
      await rm(state.reviewPath, { force: true });
    }
    return { published };
  };

  // After the gate, only publish when the human approved.
  const afterAnnotate = (state: typeof ReviewState.State) =>
    state.approved ? "publishFeedback" : END;

  // Routes a gated step to `next` unless the workflow has already decided to
  // stop (no PR found, or local commits not yet pushed) — then straight to END.
  const stopGate =
    (next: string) =>
    (state: typeof ReviewState.State): string =>
      state.stopReason ? END : next;

  const graph = new StateGraph(ReviewState)
    .addNode("detectBranch", detectBranch)
    .addNode("fetchRemote", fetchRemote)
    .addNode("checkLocalAhead", checkLocalAhead)
    .addNode("identifyPr", identifyPr)
    .addNode("computeDiff", computeDiff)
    .addNode("reviewCode", reviewCode)
    .addNode("annotateReview", annotateReview)
    .addNode("publishFeedback", publishFeedback)
    .addEdge(START, "detectBranch")
    .addEdge("detectBranch", "fetchRemote")
    .addConditionalEdges("fetchRemote", stopGate("checkLocalAhead"), {
      checkLocalAhead: "checkLocalAhead",
      [END]: END,
    })
    .addConditionalEdges("checkLocalAhead", stopGate("identifyPr"), {
      identifyPr: "identifyPr",
      [END]: END,
    })
    .addConditionalEdges("identifyPr", stopGate("computeDiff"), {
      computeDiff: "computeDiff",
      [END]: END,
    })
    .addEdge("computeDiff", "reviewCode")
    .addEdge("reviewCode", "annotateReview")
    .addConditionalEdges("annotateReview", afterAnnotate, {
      publishFeedback: "publishFeedback",
      [END]: END,
    })
    .addEdge("publishFeedback", END)
    .compile();

  return {
    async review(onEvent?: ReviewEventHandler) {
      emit = onEvent ?? (() => {});
      try {
        const final = await graph.invoke({
          branch: "",
          repo: null,
          pr: null,
          stopReason: "",
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
          stopReason: final.stopReason,
          diff: final.diff,
          baseRef: final.baseRef,
          review: final.review,
          reviewPath: final.reviewPath,
          approved: final.approved,
          published: final.published,
        };
      } finally {
        emit = () => {};
      }
    },
    async close() {
      await gitSubAgent.close();
      await prSubAgent.close();
      await publisher.close();
    },
  };
}

export type { PrReviewer, ReviewEvent, ReviewEventHandler, ReviewResult };
export { createPrReviewer };
