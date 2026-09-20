import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { relationships, skills } from "./catalog.ts";

/** Read only a catalog skill from a caller-selected checkout, never a user-built path. */
export async function readSkill(id: string, repositoryRoot: string) {
  const skill = skills.find(entry => entry.id === id);
  if (!skill) throw new Error(`Unknown editing skill: ${id}. Run playbook skills for valid IDs.`);
  const path = resolve(repositoryRoot, skill.path);
  let instructions: string;
  try { instructions = await readFile(path, "utf8"); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Skill file missing at ${path}. Use this editor checkout or pass --repo <editor-directory>.`);
    }
    throw error;
  }
  const normalized = instructions.replace(/\r\n/g, "\n");
  if (!normalized.startsWith(`---\nname: ${skill.id}\n`)) {
    throw new Error(`Skill metadata does not match catalog ID ${skill.id} at ${path}.`);
  }
  return {
    schemaVersion: 1,
    ...skill,
    absolutePath: path,
    repositoryRoot: resolve(repositoryRoot),
    instructions,
    relationships: relationships.filter(edge => edge.from === id || edge.to === id),
    note: "Read relevant linked references relative to absolutePath. This returns instructions, not execution or review approval. Requires this editor checkout; no app or model call.",
  };
}
