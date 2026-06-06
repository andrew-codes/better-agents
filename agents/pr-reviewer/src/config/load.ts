import { applyEnv, loadAgentConfig } from "@andrew-codes/better-agents-pkg-config";
import type { PrReviewerConfig } from "./schema.js";

const AGENT_NAME = "pr-reviewer";

/**
 * Load the `pr-reviewer` entry from the central config.yml (with `${VAR}`
 * expansion). A missing file yields an empty config — all defaults apply.
 */
function loadConfig(): Promise<PrReviewerConfig> {
  return loadAgentConfig<PrReviewerConfig>(AGENT_NAME);
}

/** Inject the agent-level `env` block into `process.env` for child processes. */
function applyAgentEnv(config: PrReviewerConfig): void {
  applyEnv(config.env);
}

export { applyAgentEnv, loadConfig };
