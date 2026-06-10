import type { GitProvider } from "@andrew-codes/better-agents-pkg-types-git-provider";
import type { ModelConfig } from "@andrew-codes/better-agents-pkg-model";

/** Resolved credentials for a git host, shared by provider-backed sub-agents. */
interface GitProviderCredentials {
  /** Which git host to use. Defaults to "github". */
  gitProvider?: GitProvider;
  github?: {
    /** Falls back to the GITHUB_TOKEN env var when omitted. */
    token?: string;
  };
  bitbucket?: {
    /** Falls back to the BITBUCKET_WORKSPACE env var when omitted. */
    workspace?: string;
    /** Atlassian account email; falls back to the BITBUCKET_EMAIL env var. */
    email?: string;
    /** Atlassian API token; falls back to the BITBUCKET_API_TOKEN env var. */
    apiToken?: string;
  };
}

/** Per-sub-agent overrides under `config.subAgents`. */
interface SubAgentsConfig {
  git?: {
    model?: ModelConfig;
  };
  prIdentification?: {
    model?: ModelConfig;
  };
  codeReviewer?: {
    model?: ModelConfig;
    /** Principles the reviewer must follow (string, or a bulleted list). */
    principles?: string | string[];
    /** Desired tone of the review feedback. */
    tone?: string;
  };
}

/**
 * Agent-specific config under the `config` key for `pr-reviewer`. Git provider
 * credentials are shared by the pr-identification and feedback-publisher
 * sub-agents, so they're configured once here rather than per-sub-agent.
 */
interface PrReviewerAgentConfig extends GitProviderCredentials {
  subAgents?: SubAgentsConfig;
}

/** The full `pr-reviewer` entry parsed from the central config.yml. */
interface PrReviewerConfig {
  model?: ModelConfig;
  env?: Record<string, string>;
  config?: PrReviewerAgentConfig;
}

export type { GitProviderCredentials, PrReviewerAgentConfig, PrReviewerConfig, SubAgentsConfig };
