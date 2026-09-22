import { DatabaseSync } from 'node:sqlite';
import type { CatalogReadPort, CatalogRepository, CatalogProductCandidate, ConsolidationCounts, ProductResolver, ValidatedInput } from '../domain/contracts.js';
import { IdentityAmbiguityError } from '../domain/contracts.js';
import { canonicalizeProduct } from '../domain/product-identity.js';

const MIGRATION_VERSION = 1;

interface ProductRow { readonly Id: number; readonly Name: string; readonly Brand: string | null; readonly Category: string; }

function tableExists(database: DatabaseSync, name: string): boolean {
  return database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined;
}

function identityFor(product: ProductRow) {
  return canonicalizeProduct({ name: product.Name, brand: product.Brand, category: product.Category });
}

function assertProductSchema(database: DatabaseSync): void {
  if (!tableExists(database, 'Product')) {
    database.exec('CREATE TABLE Product (Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT NOT NULL)');
    return;
  }
  const columns = database.prepare('PRAGMA table_info(Product)').all() as readonly { readonly name: string }[];
  for (const required of ['Id', 'Name', 'Brand', 'Category']) {
    if (!columns.some((column) => column.name === required)) throw new Error(`Unsupported Product schema: missing ${required}.`);
  }
}

function assertForeignKeysClean(database: DatabaseSync): void {
  if (database.prepare('PRAGMA foreign_key_check').all().length > 0) throw new Error('Foreign-key validation failed during catalog migration.');
}

function migrateV1(database: DatabaseSync): void {
  assertProductSchema(database);
  const hadLinks = tableExists(database, 'SellerProduct');
  const oldCount = hadLinks ? Number((database.prepare('SELECT COUNT(*) AS count FROM SellerProduct').get() as { count: number }).count) : 0;
  database.exec(`CREATE TABLE SellerProduct__v1 (
    Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL,
    ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId TEXT NOT NULL,
    UNIQUE(SellerName, SellerProductId))`);
  if (hadLinks) database.exec('INSERT INTO SellerProduct__v1 (Id, SellerName, ProductId, SellerProductId) SELECT Id, SellerName, ProductId, CAST(SellerProductId AS TEXT) FROM SellerProduct');
  const copied = Number((database.prepare('SELECT COUNT(*) AS count FROM SellerProduct__v1').get() as { count: number }).count);
  if (copied !== oldCount) throw new Error('SellerProduct migration copy count mismatch.');
  if (hadLinks) database.exec('DROP TABLE SellerProduct');
  database.exec('ALTER TABLE SellerProduct__v1 RENAME TO SellerProduct');
  database.exec('CREATE INDEX idx_SellerProduct_ProductId ON SellerProduct(ProductId)');
  database.exec(`CREATE TABLE ProductIdentity (
    ProductId INTEGER PRIMARY KEY REFERENCES Product(Id) ON DELETE CASCADE,
    CanonicalVersion INTEGER NOT NULL, CanonicalName TEXT NOT NULL, CanonicalBrand TEXT NOT NULL,
    CanonicalCategory TEXT NOT NULL, Fingerprint TEXT NOT NULL UNIQUE)`);
  const insert = database.prepare('INSERT INTO ProductIdentity (ProductId, CanonicalVersion, CanonicalName, CanonicalBrand, CanonicalCategory, Fingerprint) VALUES (?, ?, ?, ?, ?, ?)');
  const products = database.prepare('SELECT Id, Name, Brand, Category FROM Product ORDER BY Id').all() as readonly ProductRow[];
  try {
    for (const product of products) {
      const identity = identityFor(product);
      insert.run(product.Id, identity.version, identity.name, identity.brand, identity.category, identity.fingerprint);
    }
  } catch (error) {
    if (error instanceof Error && /UNIQUE constraint failed: ProductIdentity\.Fingerprint/.test(error.message)) {
      throw new Error('Product identity backfill collision: multiple existing products share one canonical fingerprint.');
    }
    throw error;
  }
  assertForeignKeysClean(database);
  database.exec(`PRAGMA user_version = ${MIGRATION_VERSION}`);
}

function migrateDatabase(database: DatabaseSync): void {
  database.exec('PRAGMA foreign_keys = ON');
  const version = Number((database.prepare('PRAGMA user_version').get() as { user_version: number }).user_version);
  if (version > MIGRATION_VERSION) throw new Error(`Database schema version ${version} is newer than supported version ${MIGRATION_VERSION}.`);
  if (version === 0) migrateV1(database);
  assertForeignKeysClean(database);
}

function candidateRows(database: DatabaseSync): readonly CatalogProductCandidate[] {
  return database.prepare('SELECT Id AS id, Name AS name, Brand AS brand, Category AS category FROM Product ORDER BY Id').all() as readonly CatalogProductCandidate[];
}

/** SQLite adapter: one BEGIN IMMEDIATE transaction covers migration and consolidation. */
export class SqliteCatalogRepository implements CatalogRepository {
  constructor(private readonly databasePath: string) {}

  migrate(): void {
    const database = new DatabaseSync(this.databasePath);
    try { database.exec('PRAGMA foreign_keys = ON'); database.exec('BEGIN IMMEDIATE'); migrateDatabase(database); database.exec('COMMIT'); }
    catch (error) { try { database.exec('ROLLBACK'); } catch {} throw error; }
    finally { database.close(); }
  }

  withPlanningTransaction<T>(operation: (catalog: CatalogReadPort) => T): T {
    const database = new DatabaseSync(this.databasePath);
    try {
      database.exec('PRAGMA foreign_keys = ON'); database.exec('BEGIN IMMEDIATE'); migrateDatabase(database);
      const result = operation({ listProductCandidates: () => candidateRows(database) });
      database.exec('ROLLBACK'); return result;
    } catch (error) { try { database.exec('ROLLBACK'); } catch {} throw error; } finally { database.close(); }
  }

  consolidate(entries: ValidatedInput, resolver: ProductResolver, dryRun: boolean): ConsolidationCounts {
    const database = new DatabaseSync(this.databasePath);
    try {
      database.exec('PRAGMA foreign_keys = ON');
      database.exec('PRAGMA busy_timeout = 5000');
      database.exec('BEGIN IMMEDIATE');
      migrateDatabase(database);
      const ordered = [...entries].sort((left, right) => {
        const seller = left.sellerName.trim().localeCompare(right.sellerName.trim());
        if (seller !== 0) return seller;
        const id = left.id.trim().localeCompare(right.id.trim());
        if (id !== 0) return id;
        return canonicalizeProduct(left).fingerprint.localeCompare(canonicalizeProduct(right).fingerprint);
      });
      const work = Object.assign(ordered, { inputRowCount: entries.inputRowCount }) as ValidatedInput;
      // Resolve against a growing virtual catalog so an exact in-batch repeat
      // shares the first planned product while potential duplicates still abort.
      const resolutions = [];
      const virtualCatalog = [...candidateRows(database)];
      for (const entry of work) {
        const [resolution] = resolver.resolve(Object.assign([entry], { inputRowCount: 1 }) as ValidatedInput, virtualCatalog);
        if (resolution === undefined) throw new Error('Consolidation resolution invariant failed.');
        if (resolution.kind === 'ambiguous') throw new IdentityAmbiguityError(1);
        resolutions.push(resolution);
        if (resolution.kind === 'new') {
          virtualCatalog.push({ id: -resolutions.length, name: entry.name, brand: entry.brand, category: entry.category });
        }
      }
      const insertProduct = database.prepare('INSERT INTO Product (Name, Brand, Category) VALUES (?, ?, ?)');
      const insertIdentity = database.prepare('INSERT INTO ProductIdentity (ProductId, CanonicalVersion, CanonicalName, CanonicalBrand, CanonicalCategory, Fingerprint) VALUES (?, ?, ?, ?, ?, ?)');
      const linkFor = database.prepare('SELECT ProductId AS productId FROM SellerProduct WHERE SellerName = ? AND SellerProductId = ?');
      const insertLink = database.prepare('INSERT INTO SellerProduct (SellerName, ProductId, SellerProductId) VALUES (?, ?, ?)');
      let matchedProducts = 0; let insertedProducts = 0; let insertedLinks = 0; let alreadyPresentLinks = 0;
      const plannedProductIds = new Map<number, number>();
      for (let index = 0; index < work.length; index += 1) {
        const entry = work[index]; const resolution = resolutions[index];
        if (entry === undefined || resolution === undefined) throw new Error('Consolidation planning invariant failed.');
        let productId: number;
        if (resolution.kind === 'matched') {
          productId = resolution.productId < 0 ? plannedProductIds.get(resolution.productId) ?? 0 : resolution.productId;
          if (productId === 0) throw new Error('Planned product match invariant failed.');
          matchedProducts += 1;
        } else {
          const result = insertProduct.run(entry.name, entry.brand, entry.category);
          productId = Number(result.lastInsertRowid); const identity = canonicalizeProduct(entry);
          insertIdentity.run(productId, identity.version, identity.name, identity.brand, identity.category, identity.fingerprint);
          plannedProductIds.set(-(index + 1), productId);
          insertedProducts += 1;
        }
        const existing = linkFor.get(entry.sellerName, entry.id) as { productId: number } | undefined;
        if (existing === undefined) { insertLink.run(entry.sellerName, productId, entry.id); insertedLinks += 1; }
        else if (existing.productId === productId) alreadyPresentLinks += 1;
        else throw new Error('Seller link conflict: existing seller entry maps to a different product.');
      }
      assertForeignKeysClean(database);
      const counts = { inputRows: entries.inputRowCount, distinctSellerEntries: entries.length, matchedProducts, insertedProducts, insertedLinks, alreadyPresentLinks, rejectedRows: 0, ambiguousRows: 0 };
      database.exec(dryRun ? 'ROLLBACK' : 'COMMIT');
      return counts;
    } catch (error) { try { database.exec('ROLLBACK'); } catch {} throw error; } finally { database.close(); }
  }
}
