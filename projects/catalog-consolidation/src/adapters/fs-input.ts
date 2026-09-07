import { readFile, stat } from "node:fs/promises";
import { DEFAULT_OPERATIONAL_LIMITS, withOperationalLimits, type OperationalLimits } from "../domain/operational-limits.ts";

export class InputReadError extends Error {
  readonly code: "input_byte_limit_exceeded";
  constructor(code: "input_byte_limit_exceeded", message: string) { super(message); this.code = code; this.name = "InputReadError"; }
}

/** Reads an explicitly supplied input path with a bounded byte size. */
export async function readInput(path: string, limits: OperationalLimits = DEFAULT_OPERATIONAL_LIMITS): Promise<string> {
  limits = withOperationalLimits(limits);
  const details = await stat(path);
  if (details.size > limits.maxInputBytes) throw new InputReadError("input_byte_limit_exceeded", `input exceeds ${limits.maxInputBytes} bytes`);
  return readFile(path, "utf8");
}
