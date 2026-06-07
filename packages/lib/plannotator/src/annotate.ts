import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_BUFFER = 32 * 1024 * 1024;

/**
 * Outcome of a plannotator annotation session, mapped from the CLI's `--json`
 * decision output:
 *   - `{ decision: "approved" }`                       -> { kind: "approved" }
 *   - `{ decision: "annotated", feedback: "..." }`     -> { kind: "annotated", feedback }
 *   - `{ decision: "dismissed" }`                      -> { kind: "dismissed" }
 */
type AnnotateOutcome =
  | { kind: "approved" }
  | { kind: "annotated"; feedback: string }
  | { kind: "dismissed" };

interface DecisionJson {
  decision?: string;
  feedback?: string;
}

/** Parse the last JSON object carrying a `decision` field from CLI stdout. */
function parseDecision(stdout: string): DecisionJson | null {
  const lines = stdout.split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith("{")) continue;
    try {
      const parsed = JSON.parse(line) as DecisionJson;
      if (typeof parsed.decision === "string") return parsed;
    } catch {
      // Not the JSON line; keep scanning upward.
    }
  }
  return null;
}

/**
 * Open a plannotator annotation session on `file` and block until the human
 * resolves it. Uses the `annotate --json` gate so the decision is machine
 * readable. A dismissed/unparseable session is treated as "dismissed" (the
 * caller stops the workflow rather than publishing).
 */
async function annotate(file: string): Promise<AnnotateOutcome> {
  const { stdout } = await execFileAsync("plannotator", ["annotate", file, "--json"], {
    maxBuffer: MAX_BUFFER,
  });

  const decision = parseDecision(stdout);
  if (!decision) return { kind: "dismissed" };

  switch (decision.decision) {
    case "approved":
      return { kind: "approved" };
    case "annotated":
      return { kind: "annotated", feedback: decision.feedback ?? "" };
    default:
      return { kind: "dismissed" };
  }
}

export type { AnnotateOutcome };
export { annotate };
