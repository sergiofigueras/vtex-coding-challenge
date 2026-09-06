import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { migrateCatalog } from "../src/adapters/sqlite-catalog.ts";
import { resolveProduct, type ExistingProduct } from "../src/domain/product-identity.ts";
import { parseAndValidateInput } from "../src/domain/input.ts";

const directory = mkdtempSync(join(tmpdir(), "catalog-identity-fixture-"));
test.after(() => rmSync(directory, { recursive: true, force: true }));

test("private fixture variants resolve deterministically with only canonical matches", () => {
  const path = join(directory, "catalog.db");
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
    assert.equal(resolutions.filter((resolution) => resolution.kind === "matched").length, 265);
    assert.equal(resolutions.filter((resolution) => resolution.kind === "new").length, 3);
    assert.equal(resolutions.filter((resolution) => resolution.kind === "ambiguous").length, 0);
  } finally {
    database.close();
  }
});
