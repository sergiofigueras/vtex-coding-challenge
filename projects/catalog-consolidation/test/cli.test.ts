import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(join(tmpdir(), "catalog-cli-"));
const input = join(directory, "input.json");
const database = join(directory, "catalog.db");
writeFileSync(input, JSON.stringify([{ Id: "opaque", SellerName: "seller", Name: "name", Brand: null, Category: "category" }]));
new DatabaseSync(database).close();

test.after(() => rmSync(directory, { recursive: true, force: true }));
function cli(...args: string[]) {
  return spawnSync(process.execPath, ["src/cli.ts", ...args], { cwd: process.cwd(), encoding: "utf8" });
}

test("prints help and rejects invalid command arguments", () => {
  assert.equal(cli("--help").status, 0);
  assert.match(cli("--unknown").stderr, /unknown argument/);
  assert.equal(cli("--unknown").status, 2);
});

test("returns JSON-only stable summary and validation exit two", () => {
  const output = cli("--input", input, "--database", database, "--format", "json");
  assert.equal(output.status, 0);
  assert.deepEqual(Object.keys(JSON.parse(output.stdout)).sort(), ["alreadyPresentLinks", "ambiguousRows", "databasePath", "distinctSellerEntryCount", "dryRun", "duplicateInputCount", "elapsedMilliseconds", "inputRowCount", "insertedLinks", "insertedProducts", "matchedProducts", "rejectedRows", "schemaVersion"].sort());
  assert.equal(output.stderr, "");
  assert.equal(cli("--input", join(directory, "missing"), "--database", database).status, 2);
});

test("dry run produces equivalent planned counts without changing database bytes", () => {
  const before = createHash("sha256").update(readFileSync(database)).digest("hex");
  const dry = JSON.parse(cli("--input", input, "--database", database, "--dry-run", "--format", "json").stdout);
  const real = JSON.parse(cli("--input", input, "--database", database, "--format", "json").stdout);
  const after = createHash("sha256").update(readFileSync(database)).digest("hex");
  assert.equal(before, after);
  assert.deepEqual({ ...dry, dryRun: false, elapsedMilliseconds: 0 }, { ...real, elapsedMilliseconds: 0 });
});
