import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const { SqliteCatalogRepository } = await import('../dist/adapters/sqlite-catalog-repository.js');
const sourceDatabase = new URL('../.sdd/inputs/catalog.db', import.meta.url);

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function temporaryDatabase(prefix = 'catalog-schema-') {
  const directory = mkdtempSync(join(tmpdir(), prefix));
  return { directory, database: join(directory, 'catalog.db') };
}

function createLegacyDatabase(database, products) {
  const connection = new DatabaseSync(database);
  connection.exec(`CREATE TABLE Product (Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT);
    CREATE TABLE SellerProduct (Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);`);
  const insert = connection.prepare('INSERT INTO Product (Name, Brand, Category) VALUES (?, ?, ?)');
  for (const product of products) insert.run(product.name, product.brand, product.category);
  connection.close();
}

test('AC-003-01: the supplied catalog migrates with 975 products and clean foreign keys', () => {
  const fixture = temporaryDatabase();
  try {
    copyFileSync(sourceDatabase, fixture.database);
    new SqliteCatalogRepository(fixture.database).migrate();
    const database = new DatabaseSync(fixture.database, { readOnly: true });
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 1);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM Product').get().count, 975);
    assert.equal(database.prepare('SELECT COUNT(*) AS count FROM ProductIdentity').get().count, 975);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    const sellerProductSql = database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'SellerProduct'").get().sql;
    assert.match(sellerProductSql, /SellerProductId TEXT NOT NULL/);
    assert.match(sellerProductSql, /UNIQUE\(SellerName, SellerProductId\)/);
    assert.ok(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_SellerProduct_ProductId'").get());
    database.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('AC-003-02: migration is a no-op and future schema versions fail without mutation', () => {
  const fixture = temporaryDatabase();
  try {
    createLegacyDatabase(fixture.database, [{ name: 'One', brand: null, category: 'Category' }]);
    const repository = new SqliteCatalogRepository(fixture.database);
    repository.migrate();
    const afterFirstMigration = sha256(fixture.database);
    repository.migrate();
    assert.equal(sha256(fixture.database), afterFirstMigration);

    const database = new DatabaseSync(fixture.database);
    database.exec('PRAGMA user_version = 2');
    database.close();
    const beforeFutureAttempt = sha256(fixture.database);
    assert.throws(() => repository.migrate(), /newer than supported version/);
    assert.equal(sha256(fixture.database), beforeFutureAttempt);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('AC-003-03: numeric legacy IDs become text and arbitrary string IDs round-trip', () => {
  const fixture = temporaryDatabase();
  try {
    createLegacyDatabase(fixture.database, [{ name: 'One', brand: null, category: 'Category' }]);
    const legacy = new DatabaseSync(fixture.database);
    legacy.prepare('INSERT INTO SellerProduct (SellerName, ProductId, SellerProductId) VALUES (?, ?, ?)').run('Legacy seller', 1, 42);
    legacy.close();
    new SqliteCatalogRepository(fixture.database).migrate();

    const database = new DatabaseSync(fixture.database);
    const migrated = database.prepare('SELECT SellerProductId, typeof(SellerProductId) AS type FROM SellerProduct WHERE SellerName = ?').get('Legacy seller');
    assert.equal(migrated.SellerProductId, '42');
    assert.equal(migrated.type, 'text');
    const opaqueId = 'sku/α; not-a-number';
    database.prepare('INSERT INTO SellerProduct (SellerName, ProductId, SellerProductId) VALUES (?, ?, ?)').run('New seller', 1, opaqueId);
    assert.equal(database.prepare('SELECT SellerProductId FROM SellerProduct WHERE SellerName = ?').get('New seller').SellerProductId, opaqueId);
    database.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('AC-003-04: identity backfill collisions roll back the exact pre-migration database', () => {
  const fixture = temporaryDatabase();
  try {
    createLegacyDatabase(fixture.database, [
      { name: 'Café-maker', brand: 'Brand', category: 'Kitchen' },
      { name: 'Cafe maker', brand: 'Brand', category: 'Kitchen' },
    ]);
    const beforeMigration = sha256(fixture.database);
    assert.throws(
      () => new SqliteCatalogRepository(fixture.database).migrate(),
      /Product identity backfill collision/,
    );
    assert.equal(sha256(fixture.database), beforeMigration);
    const database = new DatabaseSync(fixture.database, { readOnly: true });
    assert.equal(database.prepare('PRAGMA user_version').get().user_version, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'ProductIdentity'").get().count, 0);
    database.close();
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
