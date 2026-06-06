import type { ModelConfig } from "@andrew-codes/better-agents-pkg-model";
import type { GitProvider } from "@andrew-codes/better-agents-pkg-sub-agent-pr-identification";

/** Per-sub-agent overrides under `config.subAgents`. */
interface SubAgentsConfig {
  git?: {
    model?: ModelConfig;
  };
  prIdentification?: {
    model?: ModelConfig;
    /** Which git host to query. Defaults to "github". */
    gitProvider?: GitProvider;
    github?: {
      /** Falls back to the GITHUB_TOKEN env var when omitted. */
      token?: string;
    };
    bitbucket?: {
      username?: string;
      workspace?: string;
      token?: string;
    };
  };
}

/** Agent-specific config under the `config` key for `pr-reviewer`. */
interface PrReviewerAgentConfig {
  subAgents?: SubAgentsConfig;
}

/** The full `pr-reviewer` entry parsed from the central config.yml. */
interface PrReviewerConfig {
  model?: ModelConfig;
  env?: Record<string, string>;
  config?: PrReviewerAgentConfig;
}

export type { PrReviewerAgentConfig, PrReviewerConfig, SubAgentsConfig };
