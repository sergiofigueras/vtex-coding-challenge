import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { migrateCatalog } from "../src/adapters/sqlite-catalog.ts";
import { consolidate } from "../src/application/consolidation.ts";
import { resolveProduct, type ExistingProduct } from "../src/domain/product-identity.ts";
import { parseAndValidateInput } from "../src/domain/input.ts";

const directory = mkdtempSync(join(tmpdir(), "catalog-identity-fixture-"));
test.after(() => rmSync(directory, { recursive: true, force: true }));

test("private fixture variants resolve deterministically with the reviewed token aliases", () => {
  const path = join(directory, "identity-catalog.db");
  copyFileSync(".sdd/inputs/catalog.db", path);
  migrateCatalog(path);
  const input = parseAndValidateInput(readFileSync(".sdd/inputs/ProductEntry.json", "utf8"));
  assert.equal(input.ok, true, input.ok ? undefined : JSON.stringify(input.error));
  if (!input.ok) return;

  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  try {
    const candidates = database.prepare("SELECT Id, Name, Brand, Category FROM Product ORDER BY Id").all().map((row): ExistingProduct => ({
      id: row.Id as number,
      name: row.Name as string,
      brand: row.Brand as string | null,
      category: row.Category as string,
    }));
    const resolutions = input.value.entries.map((entry) => resolveProduct({ name: entry.Name, brand: entry.Brand, category: entry.Category }, candidates));
    assert.equal(resolutions.filter((resolution) => resolution.kind === "matched").length, 267);
    assert.equal(resolutions.filter((resolution) => resolution.kind === "new").length, 1);
    assert.equal(resolutions.filter((resolution) => resolution.kind === "ambiguous").length, 0);
  } finally {
    database.close();
  }
});

test("private fixture consolidates once and has a logical no-op rerun", () => {
  const path = join(directory, "consolidation-catalog.db");
  copyFileSync(".sdd/inputs/catalog.db", path);
  const input = parseAndValidateInput(readFileSync(".sdd/inputs/ProductEntry.json", "utf8"));
  assert.equal(input.ok, true, input.ok ? undefined : JSON.stringify(input.error));
  if (!input.ok) return;

  const first = consolidate(input.value, path, false, "fixture-first", 0);
  assert.deepEqual(
    { matched: first.matchedProducts, products: first.insertedProducts, links: first.insertedLinks },
    { matched: 267, products: 1, links: 268 },
  );
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  try {
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM Product").get()?.count, 976);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM SellerProduct").get()?.count, 268);
    assert.equal(database.prepare("PRAGMA foreign_key_check").all().length, 0);
    const afterFirst = database.prepare("SELECT p.Id, p.Name, p.Brand, p.Category, i.CanonicalFingerprint FROM Product p JOIN ProductIdentity i ON i.ProductId = p.Id ORDER BY p.Id").all();
    const linksAfterFirst = database.prepare("SELECT SellerName, ProductId, SellerProductId FROM SellerProduct ORDER BY SellerName, SellerProductId").all();
    const second = consolidate(input.value, path, false, "fixture-second", 0);
    assert.deepEqual(
      { products: second.insertedProducts, links: second.insertedLinks, present: second.alreadyPresentLinks },
      { products: 0, links: 0, present: 268 },
    );
    assert.deepEqual(database.prepare("SELECT p.Id, p.Name, p.Brand, p.Category, i.CanonicalFingerprint FROM Product p JOIN ProductIdentity i ON i.ProductId = p.Id ORDER BY p.Id").all(), afterFirst);
    assert.deepEqual(database.prepare("SELECT SellerName, ProductId, SellerProductId FROM SellerProduct ORDER BY SellerName, SellerProductId").all(), linksAfterFirst);
  } finally {
    database.close();
  }
});
