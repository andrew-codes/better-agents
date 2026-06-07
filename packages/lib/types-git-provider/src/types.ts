import type { BitbucketProviderConfig } from "@andrew-codes/better-agents-pkg-mcp-bitbucket";
import type { GitHubProviderConfig } from "@andrew-codes/better-agents-pkg-mcp-github";

/** Supported git hosting providers. */
type GitProvider = "github" | "bitbucket";

type ProviderConfig = GitHubProviderConfig | BitbucketProviderConfig;

export type { GitProvider, ProviderConfig };
