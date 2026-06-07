/** Resolved configuration for the GitHub provider. */
interface GitHubProviderConfig {
  type: "github";
  /** Personal access token (from config.yml or the GITHUB_TOKEN env var). */
  token: string;
}

export type { GitHubProviderConfig };
