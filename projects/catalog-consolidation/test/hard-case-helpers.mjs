import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const { JsonInputReader } = await import('../dist/adapters/json-input-reader.js');
const { DeterministicProductResolver } = await import('../dist/adapters/deterministic-product-resolver.js');
const { SqliteCatalogRepository } = await import('../dist/adapters/sqlite-catalog-repository.js');

export function temporaryDatabase(prefix = 'catalog-hard-case-') {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  return { directory, database: join(directory, 'catalog.db') };
}

export function removeTemporaryDatabase(fixture) {
  rmSync(fixture.directory, { recursive: true, force: true });
}

export function entry(overrides = {}) {
  return { Id: 'sku-1', SellerName: 'Seller A', Name: 'Model X', Brand: 'Acme', Category: 'Electronics', ...overrides };
}

export function input(rows) {
  return new JsonInputReader().read(JSON.stringify(rows));
}

export function legacyDatabase(path, products = []) {
  const database = new DatabaseSync(path);
  database.exec('CREATE TABLE Product (Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT); CREATE TABLE SellerProduct (Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);');
  const insert = database.prepare('INSERT INTO Product (Name, Brand, Category) VALUES (?, ?, ?)');
  for (const product of products) insert.run(product.name, product.brand, product.category);
  database.close();
}

export function consolidate(path, entries, dryRun = false) {
  return new SqliteCatalogRepository(path).consolidate(entries, new DeterministicProductResolver(), dryRun);
}

export function logicalState(path) {
  const database = new DatabaseSync(path, { readOnly: true });
  const state = {
    products: database.prepare('SELECT Name, Brand, Category FROM Product ORDER BY Id').all(),
    links: database.prepare('SELECT SellerName, SellerProductId, ProductId FROM SellerProduct ORDER BY SellerName, SellerProductId').all(),
  };
  database.close();
  return state;
}
