import type { ModelConfig } from "@andrew-codes/better-agents-pkg-model";
import type { GitProvider } from "@andrew-codes/better-agents-pkg-sub-agent-pr-identification";

/** Resolved credentials for a git host, shared by provider-backed sub-agents. */
interface GitProviderCredentials {
  /** Which git host to use. Defaults to "github". */
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
}

/** Per-sub-agent overrides under `config.subAgents`. */
interface SubAgentsConfig {
  git?: {
    model?: ModelConfig;
  };
  prIdentification?: GitProviderCredentials & {
    model?: ModelConfig;
  };
  codeReviewer?: {
    model?: ModelConfig;
    /** Principles the reviewer must follow (string, or a bulleted list). */
    principles?: string | string[];
    /** Desired tone of the review feedback. */
    tone?: string;
  };
  feedbackPublisher?: GitProviderCredentials & {
    model?: ModelConfig;
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

export type { GitProviderCredentials, PrReviewerAgentConfig, PrReviewerConfig, SubAgentsConfig };
