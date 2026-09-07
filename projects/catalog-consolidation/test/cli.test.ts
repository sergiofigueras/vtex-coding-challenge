import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";

const directory = mkdtempSync(join(tmpdir(), "catalog-cli-"));
const input = join(directory, "input.json"); const database = join(directory, "catalog.db");
writeFileSync(input, JSON.stringify([{ Id: "opaque", SellerName: "seller", Name: "name", Brand: null, Category: "category" }]));
const db = new DatabaseSync(database); db.exec("CREATE TABLE Product(Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT); CREATE TABLE SellerProduct(Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);"); db.close();
test.after(() => rmSync(directory, { recursive: true, force: true }));
function cli(...args: string[]) { return spawnSync(process.execPath, ["src/cli.ts", ...args], { cwd: process.cwd(), encoding: "utf8" }); }
test("prints help and rejects invalid command arguments", () => { assert.equal(cli("--help").status, 0); assert.match(cli("--unknown").stderr, /unknown argument/); assert.equal(cli("--unknown").status, 2); });
test("returns JSON-only versioned summary and validation exit two", () => {
  const output = cli("--input", input, "--database", database, "--format", "json"); assert.equal(output.status, 0); const summary = JSON.parse(output.stdout); assert.equal(summary.schemaVersion, 1); assert.equal(summary.insertedProducts, 1); assert.equal(typeof summary.runId, "string"); assert.equal(output.stderr, "");
  const invalid = cli("--input", join(directory, "missing"), "--database", database, "--format", "json"); assert.equal(invalid.status, 2); assert.equal(JSON.parse(invalid.stdout).error.code, "unreadable_path"); assert.equal(invalid.stderr, "");
});
test("dry run produces planned counts without changing database bytes", () => {
  const dryInput = join(directory, "dry.json"); const dryDatabase = join(directory, "dry.db"); writeFileSync(dryInput, readFileSync(input)); const source = new DatabaseSync(dryDatabase); source.exec("CREATE TABLE Product(Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT); CREATE TABLE SellerProduct(Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);"); source.close();
  const before = createHash("sha256").update(readFileSync(dryDatabase)).digest("hex"); const dry = JSON.parse(cli("--input", dryInput, "--database", dryDatabase, "--dry-run", "--format", "json").stdout); const after = createHash("sha256").update(readFileSync(dryDatabase)).digest("hex"); assert.equal(before, after); assert.equal(dry.insertedProducts, 1); assert.equal(dry.dryRun, true);
});
test("documents and validates configurable operational limit flags before database access", () => {
  assert.match(cli("--help").stdout, /268435456 bytes \/ 256 MiB/);
  for (const args of [["--max-rows", "0"], ["--max-rows", "1.5"], ["--max-rows", "9007199254740992"], ["--max-rows", "1", "--max-rows", "2"], ["--max-input-bytes"]]) {
    const output = cli(...args, "--input", input, "--database", join(directory, "does-not-exist.db"));
    assert.equal(output.status, 2); assert.match(output.stderr, /max-/);
  }
  const longInput = join(directory, "long.json");
  writeFileSync(longInput, JSON.stringify([{ Id: "long", SellerName: "seller", Name: "x".repeat(1_001), Brand: null, Category: "category" }]));
  assert.equal(cli("--input", longInput, "--database", database, "--format", "json", "--max-field-length", "1000").status, 2);
  assert.equal(cli("--input", longInput, "--database", database, "--format", "json", "--busy-timeout-ms", "0").status, 0);
  assert.equal(cli("--input", input, "--database", database, "--format", "json", "--max-input-bytes", "1").status, 2);
});

test("accepts a generated valid catalog above all former operational limits", () => {
  const largeInput = join(directory, "large.json");
  const rows = Array.from({ length: 10_001 }, (_, index) => ({
    Id: `large-${index}`,
    SellerName: "large-seller",
    Name: "x".repeat(1_001),
    Brand: null,
    Category: "large-category",
  }));
  const bytes = JSON.stringify(rows);
  assert.ok(Buffer.byteLength(bytes) > 5 * 1024 * 1024);
  writeFileSync(largeInput, bytes);
  const output = cli("--input", largeInput, "--database", database, "--format", "json");
  assert.equal(output.status, 0, output.stderr);
  const summary = JSON.parse(output.stdout);
  assert.equal(summary.inputRowCount, 10_001);
  assert.equal(summary.insertedLinks, 10_001);
});
