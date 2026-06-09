/** Resolved configuration for the Bitbucket provider. */
interface BitbucketProviderConfig {
  type: "bitbucket";
  /** Bitbucket workspace slug (also the owner segment in PR URLs). */
  workspace: string;
  /**
   * Atlassian account email — the username half of the Basic auth credential
   * used both for the Rovo MCP `Authorization` header and the publisher's
   * direct Bitbucket REST calls.
   */
  email: string;
  /**
   * Atlassian API token (NOT a Bitbucket app password). Paired with `email`
   * for Basic auth. The Rovo MCP server requires API-token auth for Bitbucket
   * Cloud tools, and the same token authenticates the REST API.
   */
  apiToken: string;
}

export type { BitbucketProviderConfig };
