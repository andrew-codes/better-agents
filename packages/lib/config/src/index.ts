import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

/** Default location of the shared config per the agent-configuration conventions. */
export function defaultConfigPath(): string {
  return join(homedir(), ".config", "better-agents", "config.yml");
}

/**
 * Recursively expand `${VAR}` / `$VAR` references in string values using the
 * supplied environment (bash-style substitution). Unset variables expand to "".
 */
export function expandEnv<T>(value: T, env: NodeJS.ProcessEnv = process.env): T {
  if (typeof value === "string") {
    return value.replace(/\$\{(\w+)\}|\$(\w+)/g, (_, braced, bare) => {
      const name = braced ?? bare;
      return env[name] ?? "";
    }) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((v) => expandEnv(v, env)) as unknown as T;
  }
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = expandEnv(v, env);
    }
    return out as T;
  }
  return value;
}

/**
 * The central config lists agents as single-key maps:
 *   agents:
 *     - <agent-name>:
 *         model: ...
 * Return the entry for `agentName`, or an empty object if absent.
 */
function findAgentEntry<T extends object>(doc: unknown, agentName: string): T {
  const agents = (doc as { agents?: unknown })?.agents;
  if (!Array.isArray(agents)) return {} as T;
  for (const item of agents) {
    if (item && typeof item === "object" && agentName in item) {
      return ((item as Record<string, T>)[agentName] ?? {}) as T;
    }
  }
  return {} as T;
}

export interface LoadAgentConfigOptions {
  /** Path to the config file. Defaults to {@link defaultConfigPath}. */
  path?: string;
  /** Environment used for `${VAR}` expansion. Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
}

/**
 * Load and parse a single agent's entry from the central config.yml, expanding
 * `${VAR}` references. A missing file yields an empty config (all defaults
 * apply). Callers supply the agent-specific config shape as `T`.
 */
export async function loadAgentConfig<T extends object>(
  agentName: string,
  options: LoadAgentConfigOptions = {},
): Promise<T> {
  const path = options.path ?? defaultConfigPath();
  const env = options.env ?? process.env;

  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return {} as T;
    throw err;
  }
  const doc = parseYaml(raw);
  return expandEnv(findAgentEntry<T>(doc, agentName), env);
}

/**
 * Inject an agent-level `env` block into `process.env` so child processes
 * (e.g. MCP servers) inherit it. Existing values are not overwritten.
 */
export function applyEnv(env: Record<string, string> | undefined): void {
  for (const [key, value] of Object.entries(env ?? {})) {
    if (process.env[key] === undefined && value) {
      process.env[key] = value;
    }
  }
}
