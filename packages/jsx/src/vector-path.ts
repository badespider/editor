/** Editable, non-executable vector commands in the element's local pixel coordinates. */
export type VectorPathCommand =
  | { op: "M" | "L"; x: number; y: number }
  | { op: "Q"; cx: number; cy: number; x: number; y: number }
  | { op: "C"; c1x: number; c1y: number; c2x: number; c2y: number; x: number; y: number }
  | { op: "Z" };

export const MAX_VECTOR_PATH_COMMANDS = 1024;
export const MAX_VECTOR_PATH_COORDINATE = 1_000_000;

/** Validate and copy before any native state changes; markup, URLs and code are never accepted. */
export function parseVectorPathCommands(value: unknown): VectorPathCommand[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_VECTOR_PATH_COMMANDS)
    throw new Error(`commands must contain 1–${MAX_VECTOR_PATH_COMMANDS} vector commands`);
  let open = false;
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) throw new Error(`commands[${index}] must be a vector command object`);
    const data = entry as Record<string, unknown>;
    const fields = data.op === "M" || data.op === "L" ? ["x", "y"]
      : data.op === "Q" ? ["cx", "cy", "x", "y"]
      : data.op === "C" ? ["c1x", "c1y", "c2x", "c2y", "x", "y"]
      : data.op === "Z" ? [] : null;
    if (fields === null || Object.keys(data).some(key => key !== "op" && !fields.includes(key))) throw new Error(`commands[${index}] has an unsupported operation or field`);
    if (data.op !== "M" && !open) throw new Error(`commands[${index}] must begin a subpath with M`);
    const copy: Record<string, unknown> = { op: data.op };
    for (const field of fields) {
      const coordinate = data[field];
      if (typeof coordinate !== "number" || !Number.isFinite(coordinate) || Math.abs(coordinate) > MAX_VECTOR_PATH_COORDINATE)
        throw new Error(`commands[${index}].${field} must be a finite coordinate within ±${MAX_VECTOR_PATH_COORDINATE}`);
      copy[field] = coordinate;
    }
    if (data.op === "M") open = true;
    if (data.op === "Z") open = false;
    return copy as VectorPathCommand;
  });
}
