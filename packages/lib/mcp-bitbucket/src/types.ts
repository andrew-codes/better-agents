/** Resolved configuration for the Bitbucket provider. */
interface BitbucketProviderConfig {
  type: "bitbucket";
  username: string;
  workspace: string;
  token: string;
}

export type { BitbucketProviderConfig };
