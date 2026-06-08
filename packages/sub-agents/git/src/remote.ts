/**
 * Repository coordinates parsed from a git remote URL: the owning
 * account/organisation (GitHub `owner`, Bitbucket `workspace`) and the
 * repository name (GitHub `repo`, Bitbucket `repo_slug`).
 */
interface RepoSlug {
  owner: string;
  repo: string;
}

/**
 * Parse the owner/repo (workspace/repo-slug) out of a git remote URL.
 *
 * Both GitHub and Bitbucket encode the repository coordinates as the final two
 * path segments of the remote URL, so a single parser covers both providers
 * across the common URL shapes:
 *
 *   - scp-like:  `git@github.com:owner/repo.git`
 *   - https:     `https://github.com/owner/repo.git`
 *   - https+auth `https://x-token-auth@bitbucket.org/workspace/repo.git`
 *   - ssh://     `ssh://git@github.com/owner/repo.git`
 *
 * A trailing `.git` and any trailing slash are stripped. Returns `null` when
 * the URL is empty or has fewer than two path segments.
 */
function parseRepoSlug(remoteUrl: string): RepoSlug | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) {
    return null;
  }

  let path: string;
  // scp-like syntax (`git@host:owner/repo.git`) is not a valid URL, so detect
  // it explicitly. It never contains a `://` scheme separator.
  const scp = !trimmed.includes("://") ? trimmed.match(/^[^/]+@[^/:]+:(.+)$/) : null;
  if (scp) {
    path = scp[1];
  } else {
    try {
      path = new URL(trimmed).pathname;
    } catch {
      return null;
    }
  }

  const segments = path
    .replace(/\.git$/, "")
    .split("/")
    .filter(Boolean);
  if (segments.length < 2) {
    return null;
  }

  return {
    owner: segments[segments.length - 2],
    repo: segments[segments.length - 1],
  };
}

export type { RepoSlug };
export { parseRepoSlug };
