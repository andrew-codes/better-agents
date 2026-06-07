import { z } from "zod";

/**
 * Details about an identified pull request.
 *
 * NOTE: this intentionally excludes the code diff. The diff is computed
 * locally by the top-level agent via `git diff`, never fetched from the
 * provider.
 */
const prDetailsSchema = z.object({
  provider: z.enum(["github", "bitbucket"]),
  /** Numeric PR number (GitHub) or id (Bitbucket). */
  number: z.number().int(),
  title: z.string(),
  url: z.string(),
  author: z.string(),
  sourceBranch: z.string(),
  targetBranch: z.string(),
  state: z.string(),
  isDraft: z.boolean().default(false),
  description: z.string().default(""),
});

type PrDetails = z.infer<typeof prDetailsSchema>;

export type { PrDetails };
export { prDetailsSchema };
