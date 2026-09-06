import { readFile, stat } from "node:fs/promises";

export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

export class InputReadError extends Error {
  readonly code: "input_byte_limit_exceeded";
  constructor(code: "input_byte_limit_exceeded", message: string) { super(message); this.code = code; this.name = "InputReadError"; }
}

/** Reads an explicitly supplied input path with a bounded byte size. */
export async function readInput(path: string): Promise<string> {
  const details = await stat(path);
  if (details.size > MAX_INPUT_BYTES) throw new InputReadError("input_byte_limit_exceeded", `input exceeds ${MAX_INPUT_BYTES} bytes`);
  return readFile(path, "utf8");
}
