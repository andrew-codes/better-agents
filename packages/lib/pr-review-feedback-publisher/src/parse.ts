/**
 * Deterministic parser for the code-reviewer's Markdown review.
 *
 * The review format is produced by our own code-reviewer sub-agent, so we can
 * parse it in code rather than asking a model to re-extract it: a `## Summary`
 * section, a `## Findings` section whose bullets each cite a `` `path:line` ``
 * (optionally grouped under `###` severity subheadings such as "Blocking"), and
 * an optional `## Questions` section.
 *
 * Parsing here — instead of in the publishing model — is what makes inline
 * comment placement and the request-changes verdict reliable regardless of the
 * model driving the rest of the pipeline.
 */

/** A single review finding anchored to a file and line. */
interface Finding {
  /** Repository-relative file path cited by the finding. */
  path: string;
  /** New-side line number to anchor the inline comment to (end of a range). */
  line: number;
  /** The finding text, with the leading bullet marker stripped. */
  body: string;
  /** Whether the finding is blocking (under a "Blocking" subheading, or labelled blocking). */
  blocking: boolean;
}

/** The structured shape of a parsed review. */
interface ParsedReview {
  /** The overall assessment from the `## Summary` section. */
  summary: string;
  /** The `## Questions` section text, if any. */
  questions: string;
  /** Findings that cite a file and line, anchorable as inline comments. */
  findings: Finding[];
  /** Finding bullets too broad to anchor (no file/line citation). */
  unlocated: string[];
  /** True when any finding is blocking — drives the request-changes verdict. */
  hasBlocking: boolean;
}

/** Strip a leading `-`/`*` list marker from the first line of a bullet. */
function stripLeadingBullet(text: string): string {
  return text.replace(/^\s*[-*]\s+/, "").trim();
}

/**
 * Drop the leading `` **`path:line`** — `` citation prefix from a located
 * finding's body: the inline comment is already anchored to that file/line, so
 * repeating it is noise. Only strips when the text before the first em-dash
 * actually contains a `` `path:line` `` citation, to avoid eating real prose.
 */
function stripLeadingCitation(body: string): string {
  const dash = body.indexOf("—");
  if (dash > 0 && dash < 250 && /`[^`]+:\d+/.test(body.slice(0, dash))) {
    return body.slice(dash + 1).trim();
  }
  return body;
}

/**
 * Find the first `` `path:line` `` (or `` `path:start-end` ``) citation in a
 * finding. Returns the path and the line to anchor to — the end of a range, so
 * the comment lands on the last line the finding spans. Only backtick-quoted
 * tokens that look like a path (contain `/` or `.`) are accepted.
 */
function findCitation(text: string): { path: string; line: number } | null {
  const re = /`([^`\s]+?):(\d+)(?:-(\d+))?`/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const path = m[1];
    if (!/[/.]/.test(path)) continue;
    const line = m[3] ? Number(m[3]) : Number(m[2]);
    if (Number.isFinite(line) && line > 0) return { path, line };
  }
  return null;
}

/** Decide whether a finding is blocking from its section and its own text. */
function isBlocking(sectionIsBlocking: boolean, firstLine: string): boolean {
  if (/non-?blocking/i.test(firstLine)) return false;
  return sectionIsBlocking || /\bblock(ing|er|ed)?\b/i.test(firstLine);
}

/**
 * Parse a review Markdown document into its structured parts. Tolerant of
 * formatting variation: it keys off `##`/`###` headings and top-level bullets,
 * and falls back to scanning bullets anywhere if there is no `## Findings`
 * heading.
 */
function parseReview(markdown: string): ParsedReview {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");

  const summaryBuf: string[] = [];
  const questionBuf: string[] = [];
  const findings: Finding[] = [];
  const unlocated: string[] = [];

  let region: "none" | "summary" | "findings" | "questions" | "other" = "none";
  let sectionBlocking = false;
  let bulletBuf: string[] = [];
  let bulletBlocking = false;

  const flushBullet = () => {
    if (bulletBuf.length === 0) return;
    const text = bulletBuf.join("\n").trim();
    bulletBuf = [];
    if (!text) return;
    const body = stripLeadingBullet(text);
    const cite = findCitation(text);
    if (cite)
      findings.push({ path: cite.path, line: cite.line, body: stripLeadingCitation(body), blocking: bulletBlocking });
    else unlocated.push(body);
  };

  for (const line of lines) {
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushBullet();
      const level = heading[1].length;
      const title = heading[2].trim();
      if (level <= 2) {
        const t = title.toLowerCase();
        region = /summary/.test(t)
          ? "summary"
          : /finding/.test(t)
            ? "findings"
            : /question/.test(t)
              ? "questions"
              : "other";
        sectionBlocking = false;
      } else if (region === "findings") {
        // `###` (or deeper) severity subheading within the findings section.
        sectionBlocking = /block/i.test(title);
      }
      continue;
    }

    if (region === "summary") {
      summaryBuf.push(line);
      continue;
    }
    if (region === "questions") {
      questionBuf.push(line);
      continue;
    }
    if (region !== "findings") continue;

    const isBullet = /^\s*[-*]\s+/.test(line);
    if (isBullet) {
      flushBullet();
      bulletBuf.push(line);
      bulletBlocking = isBlocking(sectionBlocking, line);
    } else if (bulletBuf.length > 0) {
      if (line.trim() === "") flushBullet();
      else bulletBuf.push(line);
    }
  }
  flushBullet();

  return {
    summary: summaryBuf.join("\n").trim(),
    questions: questionBuf.join("\n").trim(),
    findings,
    unlocated,
    hasBlocking: findings.some((f) => f.blocking),
  };
}

export type { Finding, ParsedReview };
export { parseReview };
