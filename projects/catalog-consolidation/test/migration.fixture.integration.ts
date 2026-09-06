import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { migrateCatalog } from "../src/adapters/sqlite-catalog.ts";

const directory = mkdtempSync(join(tmpdir(), "catalog-migration-fixture-"));
test.after(() => rmSync(directory, { recursive: true, force: true }));

test("migrates the pristine private catalog with its products and clean foreign keys", () => {
  const path = join(directory, "catalog.db");
  copyFileSync(".sdd/inputs/catalog.db", path);
  migrateCatalog(path);
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  try {
    assert.equal(database.prepare("PRAGMA user_version").get()?.user_version, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM Product").get()?.count, 975);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM ProductIdentity").get()?.count, 975);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    const sellerProductSql = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'SellerProduct'").get()?.sql;
    assert.match(String(sellerProductSql), /SellerProductId TEXT NOT NULL/);
    assert.match(String(sellerProductSql), /UNIQUE\(SellerName, SellerProductId\)/);
    assert.equal(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'SellerProduct_ProductId_idx'").get()?.["1"], 1);
  } finally {
    database.close();
  }
});
