import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { consolidate, ConsolidationError } from "../src/application/consolidation.ts";
import type { ValidatedInput } from "../src/domain/input.ts";

const directory = mkdtempSync(join(tmpdir(), "catalog-consolidation-"));
test.after(() => rmSync(directory, { recursive: true, force: true }));
function input(entries: ValidatedInput["entries"]): ValidatedInput { return { entries, inputRowCount: entries.length, distinctSellerEntryCount: entries.length, duplicateInputCount: 0 }; }
function createDatabase(name: string): string {
  const path = join(directory, `${name}.db`); const db = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  db.exec("CREATE TABLE Product(Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT); CREATE TABLE SellerProduct(Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);");
  db.prepare("INSERT INTO Product(Name, Brand, Category) VALUES (?, ?, ?)").run("Café grinder", "Maker", "Kitchen"); db.close(); return path;
}
test("atomically matches, inserts, and idempotently links seller entries", () => {
  const path = createDatabase("idempotent"); const batch = input([{ Id: "opaque-1", SellerName: "seller", Name: "cafe grinder", Brand: "maker", Category: "kitchen" }, { Id: "opaque-2", SellerName: "seller", Name: "New product", Brand: "x'); DROP TABLE Product; --", Category: "tools" }]);
  const first = consolidate(batch, path, false, "run-1", 0); assert.deepEqual({ matched: first.matchedProducts, products: first.insertedProducts, links: first.insertedLinks }, { matched: 1, products: 1, links: 2 });
  const second = consolidate(batch, path, false, "run-2", 0); assert.deepEqual({ products: second.insertedProducts, links: second.insertedLinks, present: second.alreadyPresentLinks }, { products: 0, links: 0, present: 2 });
  const db = new DatabaseSync(path); try { assert.equal(db.prepare("SELECT COUNT(*) AS count FROM Product").get()?.count, 2); assert.equal(db.prepare("SELECT COUNT(*) AS count FROM SellerProduct").get()?.count, 2); assert.equal(db.prepare("SELECT Brand FROM Product WHERE Name = ?").get("New product")?.Brand, "x'); DROP TABLE Product; --"); assert.equal(db.prepare("PRAGMA foreign_key_check").all().length, 0); } finally { db.close(); }
});
test("seller link conflict rolls back the entire batch", () => {
  const path = createDatabase("conflict"); consolidate(input([{ Id: "same", SellerName: "seller", Name: "Café grinder", Brand: "Maker", Category: "Kitchen" }]), path, false, "first", 0);
  assert.throws(() => consolidate(input([{ Id: "new", SellerName: "seller", Name: "Other", Brand: null, Category: "tools" }, { Id: "same", SellerName: "seller", Name: "Different", Brand: null, Category: "tools" }]), path, false, "conflict", 0), (error: unknown) => error instanceof ConsolidationError && error.code === "seller_link_conflict");
  const db = new DatabaseSync(path); try { assert.equal(db.prepare("SELECT COUNT(*) AS count FROM Product").get()?.count, 1); assert.equal(db.prepare("SELECT COUNT(*) AS count FROM SellerProduct").get()?.count, 1); } finally { db.close(); }
});
test("dry runs roll back migrated schema and planned writes", () => {
  const path = createDatabase("dry"); const result = consolidate(input([{ Id: "one", SellerName: "seller", Name: "New", Brand: null, Category: "tools" }]), path, true, "dry", 0); assert.equal(result.insertedProducts, 1);
  const db = new DatabaseSync(path); try { assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 0); assert.equal(db.prepare("SELECT COUNT(*) AS count FROM Product").get()?.count, 1); } finally { db.close(); }
});

test("injected product write failure rolls back migration and the full batch", () => {
  const path = createDatabase("injected-failure");
  const setup = new DatabaseSync(path);
  setup.exec("CREATE TRIGGER fail_product_insert BEFORE INSERT ON Product WHEN NEW.Name = 'New' BEGIN SELECT RAISE(ABORT, 'injected product write failure'); END;");
  setup.close();
  assert.throws(() => consolidate(input([{ Id: "one", SellerName: "seller", Name: "New", Brand: null, Category: "tools" }]), path, false, "injected", 0), /injected product write failure/);
  const db = new DatabaseSync(path);
  try {
    assert.equal(db.prepare("PRAGMA user_version").get()?.user_version, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM Product").get()?.count, 1);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM SellerProduct").get()?.count, 0);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'ProductIdentity'").get()?.count, 0);
  } finally { db.close(); }
});
