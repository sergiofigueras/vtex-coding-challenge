import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const { JsonInputReader } = await import('../dist/adapters/json-input-reader.js');
const { DeterministicProductResolver } = await import('../dist/adapters/deterministic-product-resolver.js');
const { SqliteCatalogRepository } = await import('../dist/adapters/sqlite-catalog-repository.js');
const inputFixture = new URL('../.sdd/inputs/ProductEntry.json', import.meta.url);
const databaseFixture = new URL('../.sdd/inputs/catalog.db', import.meta.url);

function temporaryDatabase(prefix = 'catalog-consolidation-') {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  return { directory, database: join(directory, 'catalog.db') };
}
function input(rows) { return new JsonInputReader().read(JSON.stringify(rows)); }
function row(overrides = {}) { return { Id: 'sku', SellerName: 'Seller', Name: 'Model X', Brand: 'Acme', Category: 'Electronics', ...overrides }; }
function legacy(path, products = []) {
  const db = new DatabaseSync(path);
  db.exec('CREATE TABLE Product (Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT); CREATE TABLE SellerProduct (Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);');
  const insert = db.prepare('INSERT INTO Product (Name, Brand, Category) VALUES (?, ?, ?)');
  for (const product of products) insert.run(product.name, product.brand, product.category);
  db.close();
}
function run(path, entries, dryRun = false) { return new SqliteCatalogRepository(path).consolidate(entries, new DeterministicProductResolver(), dryRun); }

// AC-005-01 and AC-005-02: a canonical product is inserted once and seller IDs are scoped.
test('AC-005-01 and AC-005-02: deterministic product reuse, unique links, and conflicting mapping rollback', () => {
  const fixture = temporaryDatabase();
  try {
    legacy(fixture.database);
    const first = run(fixture.database, input([row({ SellerName: 'A' }), row({ SellerName: 'B' })]));
    assert.deepEqual([first.insertedProducts, first.insertedLinks], [1, 2]);
    const db = new DatabaseSync(fixture.database);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM Product').get().count, 1);
    const productId = db.prepare('SELECT Id FROM Product').get().Id;
    db.prepare('INSERT INTO Product (Name, Brand, Category) VALUES (?, ?, ?)').run('Other', 'Brand', 'Category');
    db.prepare('INSERT INTO ProductIdentity (ProductId, CanonicalVersion, CanonicalName, CanonicalBrand, CanonicalCategory, Fingerprint) VALUES (?, ?, ?, ?, ?, ?)').run(2, 1, 'other', 'brand', 'category', 'v1\u0000other\u0000brand\u0000category');
    db.prepare('UPDATE SellerProduct SET ProductId = ? WHERE SellerName = ?').run(2, 'A');
    db.close();
    assert.throws(() => run(fixture.database, input([row({ SellerName: 'A' })])), /Seller link conflict/);
    const check = new DatabaseSync(fixture.database, { readOnly: true });
    assert.equal(check.prepare('SELECT ProductId FROM SellerProduct WHERE SellerName = ?').get('A').ProductId, 2);
    assert.notEqual(productId, 2); check.close();
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('AC-005-03 and AC-005-04: supplied fixture commits expected state then is idempotent', () => {
  const fixture = temporaryDatabase();
  try {
    copyFileSync(databaseFixture, fixture.database);
    const entries = new JsonInputReader().read(readFileSync(inputFixture, 'utf8'));
    const first = run(fixture.database, entries);
    assert.equal(first.insertedLinks, 268); assert.equal(first.insertedProducts, 1);
    const second = run(fixture.database, entries);
    assert.deepEqual([second.insertedProducts, second.insertedLinks], [0, 0]);
    const db = new DatabaseSync(fixture.database, { readOnly: true });
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM Product').get().count, 976);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM SellerProduct').get().count, 268);
    assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(), []); db.close();
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});

test('AC-005-05 and AC-005-06: identity ambiguity rolls back all mutations', () => {
  const fixture = temporaryDatabase();
  try {
    legacy(fixture.database, [{ name: 'Model X', brand: 'Acme', category: 'Electronics' }]);
    const before = readFileSync(fixture.database);
    assert.throws(() => run(fixture.database, input([row({ Id: 'new', Brand: null })])), /Identity resolution found/);
    assert.deepEqual(readFileSync(fixture.database), before);
  } finally { rmSync(fixture.directory, { recursive: true, force: true }); }
});
