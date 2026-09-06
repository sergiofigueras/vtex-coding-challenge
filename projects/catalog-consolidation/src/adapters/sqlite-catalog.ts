import { access, constants, stat } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";

export async function verifyDatabasePath(path: string): Promise<void> {
  const details = await stat(path);
  if (!details.isFile()) throw new Error("database path is not a file");
  await access(path, constants.R_OK);
}

/** Opens a supplied catalog read-only without starting a write transaction. */
export function verifyDatabase(path: string): void {
  const database = new DatabaseSync(path, { open: true, readOnly: true });
  database.close();
}
