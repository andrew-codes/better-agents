/** Supported git hosting providers. */
type GitProvider = "github" | "bitbucket";

/** Resolved configuration for the GitHub provider. */
interface GitHubProviderConfig {
  type: "github";
  /** Personal access token (from config.yml or the GITHUB_TOKEN env var). */
  token: string;
}

/** Resolved configuration for the Bitbucket provider. */
interface BitbucketProviderConfig {
  type: "bitbucket";
  username: string;
  workspace: string;
  token: string;
}

type ProviderConfig = GitHubProviderConfig | BitbucketProviderConfig;

export type { BitbucketProviderConfig, GitHubProviderConfig, GitProvider, ProviderConfig };
