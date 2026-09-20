import { readFile, realpath, stat } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { recommend } from "./catalog.ts";
import { selectStyleProfile, styleProfileIdSchema, styleProfileSchema, workflowConfigPath, workflowConfigSchema } from "./style-profile.ts";
import type { StyleProfileContext } from "./style-profile.ts";

async function readRepoJson(repositoryRoot: string, path: string, optional = false): Promise<unknown> {
  const root = await realpath(repositoryRoot);
  let target: string;
  try { target = await realpath(resolve(root, path)); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      if (optional) return undefined;
      throw new Error(`Style profile file missing: ${path}. Use the intended editor checkout with --repo.`);
    }
    throw error;
  }
  const within = relative(root, target);
  if (isAbsolute(within) || within === ".." || within.startsWith("../") || within.startsWith("..\\")) {
    throw new Error(`Profile/config must stay inside the selected repository: ${path}`);
  }
  const metadata = await stat(target);
  if (!metadata.isFile() || metadata.size > 65_536) throw new Error(`Profile/config must be a JSON file at most 64 KiB: ${path}`);
  const content = await readFile(target, "utf8");
  if (Buffer.byteLength(content) > 65_536) throw new Error(`Profile/config exceeds 64 KiB: ${path}`);
  try { return JSON.parse(content); }
  catch { throw new Error(`Invalid JSON in ${path}`); }
}

/** Reads only this root's fixed config; no cwd, parent, home or environment search. */
export async function readWorkflowConfig(repositoryRoot: string) {
  const input = await readRepoJson(repositoryRoot, workflowConfigPath, true);
  return input === undefined ? null : workflowConfigSchema.parse(input);
}

/** IDs map to fixed relative JSON paths; metadata and stored ID must agree. */
export async function readStyleProfile(id: string, repositoryRoot: string) {
  styleProfileIdSchema.parse(id);
  const profile = styleProfileSchema.parse(await readRepoJson(repositoryRoot, `profiles/${id}.json`));
  if (profile.id !== id) throw new Error(`Style profile ID mismatch: requested ${id}, found ${profile.id}.`);
  return profile;
}

export interface ProfileRecommendationInput extends StyleProfileContext {
  repositoryRoot: string;
  hasReference?: boolean;
  /** CLI --profile: a local profile ID, "none", or omitted for repo-local routing. */
  profile?: string;
}

/** Complete recommendation with inline profile instructions for any calling agent. */
export async function recommendWithProfile(input: ProfileRecommendationInput) {
  const repositoryRoot = resolve(input.repositoryRoot);
  // Explicit overrides remain usable even when an unused default config is broken.
  const config = input.profile === undefined ? await readWorkflowConfig(repositoryRoot) : undefined;
  const selection = selectStyleProfile(input, config);
  const profile = selection.id ? await readStyleProfile(selection.id, repositoryRoot) : null;
  return {
    ...recommend(input.format, input.goal, input.hasReference, input.task, profile),
    profileSelection: { ...selection, configPath: config ? workflowConfigPath : null },
    repositoryRoot,
  };
}
