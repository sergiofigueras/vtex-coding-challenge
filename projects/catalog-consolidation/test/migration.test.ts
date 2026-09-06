import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { CatalogMigrationError, migrateCatalog, migrateCatalogDatabase } from "../src/adapters/sqlite-catalog.ts";

const directory = mkdtempSync(join(tmpdir(), "catalog-migration-"));
test.after(() => rmSync(directory, { recursive: true, force: true }));

function pathFor(name: string): string {
  return join(directory, `${name}.db`);
}

function hash(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function createLegacyDatabase(name: string, products: readonly { name: string; brand: string | null; category: string }[] = [{ name: "Existing product", brand: null, category: "tools" }]): string {
  const path = pathFor(name);
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  database.exec(`
    CREATE TABLE Product(Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT);
    CREATE TABLE SellerProduct(Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);
  `);
  const insert = database.prepare("INSERT INTO Product(Name, Brand, Category) VALUES (?, ?, ?)");
  for (const product of products) insert.run(product.name, product.brand, product.category);
  database.close();
  return path;
}

test("re-running the supported migration is a byte-preserving no-op and future versions fail unchanged", () => {
  const path = createLegacyDatabase("versions");
  migrateCatalog(path);
  const afterMigration = hash(path);
  migrateCatalog(path);
  assert.equal(hash(path), afterMigration);

  const database = new DatabaseSync(path);
  database.exec("PRAGMA user_version = 2");
  database.close();
  const beforeFutureFailure = hash(path);
  assert.throws(() => migrateCatalog(path), (error: unknown) => error instanceof CatalogMigrationError && /newer than supported/.test(error.message));
  assert.equal(hash(path), beforeFutureFailure);
});

test("rebuilds numeric seller IDs as text and preserves arbitrary text IDs", () => {
  const path = createLegacyDatabase("seller-ids");
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  database.prepare("INSERT INTO SellerProduct(SellerName, ProductId, SellerProductId) VALUES (?, ?, ?)").run("seller", 1, 42);
  migrateCatalogDatabase(database);
  try {
    const migrated = database.prepare("SELECT SellerProductId, typeof(SellerProductId) AS storageType FROM SellerProduct").get();
    assert.equal(migrated?.SellerProductId, "42");
    assert.equal(migrated?.storageType, "text");
    database.prepare("INSERT INTO SellerProduct(SellerName, ProductId, SellerProductId) VALUES (?, ?, ?)").run("other", 1, "opaque-'--; Ω");
    assert.equal(database.prepare("SELECT SellerProductId FROM SellerProduct WHERE SellerName = ?").get("other")?.SellerProductId, "opaque-'--; Ω");
  } finally {
    database.close();
  }
});

test("identity collisions abort and restore exact pre-migration bytes", () => {
  const path = createLegacyDatabase("collision", [
    { name: "Café grinder", brand: "Maker", category: "Kitchen" },
    { name: "cafe grinder", brand: "maker", category: "kitchen" },
  ]);
  const before = hash(path);
  assert.throws(() => migrateCatalog(path), (error: unknown) => error instanceof CatalogMigrationError && /identity collision/.test(error.message));
  assert.equal(hash(path), before);
  const database = new DatabaseSync(path);
  try {
    assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM SellerProduct").get()?.count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'ProductIdentity'").get()?.count, 0);
  } finally {
    database.close();
  }
});
