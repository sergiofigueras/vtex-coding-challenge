import { readFile, stat } from "node:fs/promises";

export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

/** Reads an explicitly supplied input path with a bounded byte size. */
export async function readInput(path: string): Promise<string> {
  const details = await stat(path);
  if (details.size > MAX_INPUT_BYTES) throw new Error("input exceeds maximum byte size");
  return readFile(path, "utf8");
}
