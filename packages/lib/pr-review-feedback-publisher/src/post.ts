/**
 * Deterministic posting of a parsed review to a pull request.
 *
 * GitHub posting invokes the official MCP server's tools directly here (not via
 * a model) so that inline comment placement and the request-changes verdict are
 * guaranteed rather than left to a model to assemble correctly.
 *
 * Bitbucket posting goes straight to the Bitbucket Cloud REST API: the official
 * Rovo MCP server exposes no line-anchored inline-comment tool, so the only way
 * to anchor a comment to a file/line is the REST `inline` field.
 */
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { BitbucketProviderConfig } from "@andrew-codes/better-agents-pkg-mcp-bitbucket";
import type { Finding, ParsedReview } from "./parse.js";

/** Result of a publish: a short human summary plus any created URL. */
interface PublishResult {
  message: string;
}

/** Find an allowlisted MCP tool by name, or throw if it is missing. */
function requireTool(tools: StructuredToolInterface[], name: string): StructuredToolInterface {
  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Required tool "${name}" is not available.`);
  return tool;
}

/** Invoke an MCP tool and coerce its result to a string. */
async function invokeTool(
  tool: StructuredToolInterface,
  args: Record<string, unknown>,
): Promise<string> {
  const result = (await tool.invoke(args)) as unknown;
  if (typeof result === "string") return result;
  try {
    return JSON.stringify(result);
  } catch {
    return String(result);
  }
}

/** Best-effort extraction of a web URL from a tool's JSON-ish result. */
function extractUrl(result: string): string | undefined {
  const m = /"html_url"\s*:\s*"([^"]+)"/.exec(result) ?? /"links?"[\s\S]*?"href"\s*:\s*"([^"]+)"/.exec(result);
  return m?.[1];
}

/** GitHub-style and Bitbucket-style PR URL coordinate parsers. */
function parseGitHubCoords(url: string): { owner: string; repo: string } {
  const m = /github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?\/(?:pull|pulls)\//i.exec(url);
  if (!m) throw new Error(`Could not parse GitHub owner/repo from PR URL: ${url}`);
  return { owner: m[1], repo: m[2] };
}

function parseBitbucketCoords(url: string): { workspace: string; repo: string } {
  const m = /bitbucket\.org\/([^/]+)\/([^/]+?)(?:\.git)?\/pull-requests\//i.exec(url);
  if (!m) throw new Error(`Could not parse Bitbucket workspace/repo from PR URL: ${url}`);
  return { workspace: m[1], repo: m[2] };
}

/** Render the located findings as a Markdown list, for the fallback body path. */
function findingsAsMarkdown(findings: Finding[]): string {
  return findings.map((f) => `- \`${f.path}:${f.line}\` — ${f.body}`).join("\n");
}

/**
 * Build the review body from the summary, any broad (unanchored) findings, and
 * the Questions section. GitHub requires a non-empty body, so a fallback is
 * provided.
 */
function buildBody(parsed: ParsedReview): string {
  const parts: string[] = [];
  if (parsed.summary) parts.push(parsed.summary);
  if (parsed.unlocated.length > 0) {
    parts.push(["### Additional notes", parsed.unlocated.map((u) => `- ${u}`).join("\n")].join("\n"));
  }
  if (parsed.questions) parts.push(["### Questions", parsed.questions].join("\n"));
  return parts.join("\n\n") || "Code review.";
}

/** Does an error message indicate a self-review (can't approve/request changes on own PR)? */
function isSelfReviewError(message: string): boolean {
  return /own pull request/i.test(message);
}

/** Does an error message indicate an inline comment could not be anchored to the diff? */
function isDiffAnchorError(message: string): boolean {
  return /part of the diff|must be part of|invalid.*line|line.*invalid|pull_request_review_thread/i.test(message);
}

/**
 * Post the review to a GitHub PR as a single review: summary as the body, each
 * located finding as an inline comment, and the verdict as the review event.
 *
 * Fetches the PR's head commit SHA via `get_pull_request` and passes it as
 * `commit_id` — without it, GitHub cannot resolve any comment's `path`/`line`
 * against the PR's diff and rejects the whole review with "Path could not be
 * resolved" for every comment, regardless of how correct they are.
 *
 * Recovery is surgical, not all-or-nothing:
 *  - self-review rejection → degrade the event to COMMENT but keep the inline
 *    comments and record the intended verdict in the body;
 *  - a comment that cannot anchor to the diff → move all findings into the body
 *    and retry without inline comments (last resort).
 */
async function publishToGitHub(
  tools: StructuredToolInterface[],
  target: { number: number; url: string },
  parsed: ParsedReview,
): Promise<PublishResult> {
  const reviewTool = requireTool(tools, "create_pull_request_review");
  const getPrTool = requireTool(tools, "get_pull_request");
  const { owner, repo } = parseGitHubCoords(target.url);

  // GitHub needs the head commit SHA to resolve each comment's `path`/`line`
  // against the PR's diff — without it every path comes back "could not be
  // resolved", even when the path and line are correct.
  const prResult = await invokeTool(getPrTool, { owner, repo, pull_number: target.number });
  const shaMatch = /"sha"\s*:\s*"([0-9a-f]{7,40})"/i.exec(
    /"head"\s*:\s*\{[\s\S]*?\}/i.exec(prResult)?.[0] ?? "",
  );
  const commitId = shaMatch?.[1];

  const comments = parsed.findings.map((f) => ({ path: f.path, line: f.line, body: f.body }));
  let event: "REQUEST_CHANGES" | "COMMENT" = parsed.hasBlocking ? "REQUEST_CHANGES" : "COMMENT";
  let body = buildBody(parsed);
  let useComments = true;
  let verdictNoteAdded = false;

  // Up to three attempts: initial, self-review degrade, no-comments fallback.
  for (let attempt = 0; attempt < 3; attempt++) {
    const args: Record<string, unknown> = {
      owner,
      repo,
      pull_number: target.number,
      event,
      body: useComments ? body : `${body}\n\n### Findings\n${findingsAsMarkdown(parsed.findings)}`,
    };
    if (commitId) args.commit_id = commitId;
    if (useComments && comments.length > 0) args.comments = comments;

    try {
      const result = await invokeTool(reviewTool, args);
      const url = extractUrl(result);
      const placed = useComments ? comments.length : 0;
      const verdict = event === "REQUEST_CHANGES" ? "request-changes" : "comment";
      return {
        message:
          `Posted GitHub review on PR #${target.number} as ${verdict}` +
          ` with ${placed} inline comment${placed === 1 ? "" : "s"}` +
          (useComments ? "" : " (findings folded into the body after an anchoring failure)") +
          (url ? ` — ${url}` : "."),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isSelfReviewError(message) && event !== "COMMENT") {
        event = "COMMENT";
        if (!verdictNoteAdded) {
          body =
            `> **Requesting changes** — there ${parsed.findings.filter((f) => f.blocking).length === 1 ? "is a blocking finding" : "are blocking findings"} below. ` +
            `(Posted as a comment because the reviewing account is the PR author; GitHub does not allow a formal request-changes verdict on your own PR.)\n\n` +
            body;
          verdictNoteAdded = true;
        }
        continue;
      }
      if (isDiffAnchorError(message) && useComments) {
        useComments = false;
        continue;
      }
      throw new Error(`Failed to post GitHub review: ${message}`);
    }
  }
  throw new Error(`Failed to post GitHub review on PR #${target.number} after recovery attempts.`);
}

/** Shape of a Bitbucket PR comment request body (general or inline). */
interface BitbucketCommentBody {
  content: { raw: string };
  /** Present for inline comments: anchors to the new-side (`to`) line of a file. */
  inline?: { path: string; to: number };
}

/**
 * POST a comment to the Bitbucket Cloud REST API and return the raw JSON
 * response text. Throws on any non-2xx so the caller's per-comment fallback can
 * demote an un-anchorable inline comment to a general one.
 */
async function postBitbucketComment(
  endpoint: string,
  auth: string,
  body: BitbucketCommentBody,
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { authorization: auth, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Bitbucket REST ${res.status} ${res.statusText}: ${text}`);
  }
  return text;
}

/** Best-effort extraction of the human (html) comment URL from a Bitbucket response. */
function extractBitbucketHtmlUrl(result: string): string | undefined {
  return /"html"\s*:\s*\{\s*"href"\s*:\s*"([^"]+)"/.exec(result)?.[1];
}

/**
 * Post the review to a Bitbucket PR via the REST API: the summary as a general
 * comment, then each located finding as its own inline comment anchored to its
 * file/line. Bitbucket exposes no request-changes verdict, so a blocking
 * outcome is stated in the summary comment. Each comment is an independent
 * request, so a single bad anchor only degrades that one comment to a general
 * comment (the official Rovo MCP server has no inline-comment tool, hence REST).
 */
async function publishToBitbucket(
  provider: BitbucketProviderConfig,
  target: { number: number; url: string },
  parsed: ParsedReview,
): Promise<PublishResult> {
  let workspace: string;
  let repo: string;
  try {
    ({ workspace, repo } = parseBitbucketCoords(target.url));
  } catch {
    workspace = provider.workspace;
    const m = /bitbucket\.org\/[^/]+\/([^/]+)/i.exec(target.url);
    if (!m) throw new Error(`Could not parse Bitbucket repo from PR URL: ${target.url}`);
    repo = m[1];
  }

  const auth = `Basic ${Buffer.from(`${provider.email}:${provider.apiToken}`).toString("base64")}`;
  const endpoint =
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}` +
    `/pullrequests/${target.number}/comments`;

  const summary = parsed.hasBlocking
    ? `**Requesting changes** — see the blocking findings below.\n\n${buildBody(parsed)}`
    : buildBody(parsed);

  const summaryResult = await postBitbucketComment(endpoint, auth, { content: { raw: summary } });
  const summaryUrl = extractBitbucketHtmlUrl(summaryResult);

  let placed = 0;
  let demoted = 0;
  for (const f of parsed.findings) {
    try {
      await postBitbucketComment(endpoint, auth, {
        content: { raw: f.body },
        inline: { path: f.path, to: f.line },
      });
      placed++;
    } catch {
      await postBitbucketComment(endpoint, auth, {
        content: { raw: `\`${f.path}:${f.line}\` — ${f.body}` },
      });
      demoted++;
    }
  }

  return {
    message:
      `Posted Bitbucket review on PR #${target.number}` +
      (parsed.hasBlocking ? " (requesting changes, stated in the summary)" : "") +
      ` with ${placed} inline comment${placed === 1 ? "" : "s"}` +
      (demoted > 0 ? ` (${demoted} demoted to general comments after an anchoring failure)` : "") +
      (summaryUrl ? ` — ${summaryUrl}` : "."),
  };
}

export type { PublishResult };
export { publishToGitHub, publishToBitbucket };
