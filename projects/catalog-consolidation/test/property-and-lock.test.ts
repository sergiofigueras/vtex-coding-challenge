import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { consolidate, SqliteCatalogRepository } from "../src/adapters/sqlite-catalog.ts";
import { parseAndValidateInput } from "../src/domain/input.ts";
import { withOperationalLimits } from "../src/domain/operational-limits.ts";

function database(path: string): void {
  const db = new DatabaseSync(path);
  db.exec("CREATE TABLE Product(Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT); CREATE TABLE SellerProduct(Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);");
  db.close();
}
function validated(rows: unknown[]) {
  const result = parseAndValidateInput(JSON.stringify(rows));
  assert.equal(result.ok, true);
  return result.value;
}

test("consolidation is invariant under every input permutation", () => {
  const rows = [
    { Id: "z", SellerName: "seller-b", Name: "Widget", Brand: null, Category: "tools" },
    { Id: "a", SellerName: "seller-a", Name: "Router", Brand: "Acme", Category: "network" },
    { Id: "m", SellerName: "seller-a", Name: "Café", Brand: null, Category: "food" },
  ];
  const directory = mkdtempSync(join(tmpdir(), "catalog-permutation-"));
  try {
    const first = join(directory, "first.db"); const second = join(directory, "second.db");
    database(first); database(second);
    consolidate(validated(rows), first, false, "first");
    consolidate(validated([...rows].reverse()), second, false, "second");
    const dump = (path: string) => { const db = new DatabaseSync(path); const value = { products: db.prepare("SELECT Name, Brand, Category FROM Product ORDER BY Id").all(), links: db.prepare("SELECT SellerName, SellerProductId, ProductId FROM SellerProduct ORDER BY SellerName, SellerProductId").all() }; db.close(); return value; };
    assert.deepEqual(dump(first), dump(second));
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test("repository accepts an injected zero busy timeout and reports a lock failure", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalog-lock-"));
  const path = join(directory, "locked.db");
  const holder = new DatabaseSync(path); holder.exec("CREATE TABLE Product(Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT); CREATE TABLE SellerProduct(Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);");
  holder.exec("BEGIN EXCLUSIVE");
  try {
    assert.throws(() => new SqliteCatalogRepository(path, withOperationalLimits({ busyTimeoutMs: 0 })).transact(false, () => {}), (error: unknown) => {
      const code = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
      return code === "ERR_SQLITE_BUSY" || code === "SQLITE_BUSY" || (error instanceof Error && /database is locked/i.test(error.message));
    });
  } finally { holder.exec("ROLLBACK"); holder.close(); rmSync(directory, { recursive: true, force: true }); }
});
