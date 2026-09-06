import { access, constants, stat } from "node:fs/promises";
import { DatabaseSync, type SQLInputValue, type SQLOutputValue } from "node:sqlite";
import { CANONICALIZATION_VERSION, canonicalizeProduct, type CanonicalProductIdentity } from "../domain/product-identity.ts";
import { ConsolidationService, type CatalogRepository, type CatalogTransaction, type ConsolidationSummary } from "../application/consolidation.ts";
import type { SellerEntry, ValidatedInput } from "../domain/input.ts";

export const CATALOG_SCHEMA_VERSION = 1;
export { CANONICALIZATION_VERSION };

export class CatalogMigrationError extends Error { override name = "CatalogMigrationError"; }

export async function verifyDatabasePath(path: string): Promise<void> {
  const details = await stat(path);
  if (!details.isFile()) throw new Error("database path is not a file");
  await access(path, constants.R_OK);
}

/** Opens a supplied catalog read-only without starting a write transaction. */
export function verifyDatabase(path: string): void {
  const database = new DatabaseSync(path, { open: true, readOnly: true, enableForeignKeyConstraints: true });
  database.close();
}

function scalar(database: DatabaseSync, sql: string, ...parameters: SQLInputValue[]): SQLOutputValue {
  const row = database.prepare(sql).get(...parameters);
  if (row === undefined) throw new CatalogMigrationError(`expected a result from: ${sql}`);
  const value = Object.values(row)[0];
  if (value === undefined) throw new CatalogMigrationError(`expected a scalar result from: ${sql}`);
  return value;
}
function count(database: DatabaseSync, table: "Product" | "SellerProduct" | "SellerProduct__v1" | "ProductIdentity"): number {
  const result = scalar(database, `SELECT COUNT(*) AS count FROM ${table}`);
  if (typeof result !== "number") throw new CatalogMigrationError(`unexpected row count for ${table}`);
  return result;
}
/** Compatibility helper for migration tests; product identity owns canonicalization. */
export function canonicalizeForMigration(value: string | null): string { return canonicalizeProduct({ name: value ?? "", brand: null, category: "" }).name; }
function productIdentity(name: string, brand: string | null, category: string | null) { return canonicalizeProduct({ name, brand, category: category ?? "" }); }
function assertNoIdentityCollisions(database: DatabaseSync): void {
  const seen = new Map<string, number>();
  for (const product of database.prepare("SELECT Id, Name, Brand, Category FROM Product ORDER BY Id").all()) {
    const { Id: id, Name: name, Brand: brand, Category: category } = product;
    if (typeof id !== "number" || typeof name !== "string" || (brand !== null && typeof brand !== "string") || (category !== null && typeof category !== "string")) throw new CatalogMigrationError("Product has an unsupported row shape");
    const key = productIdentity(name, brand, category).fingerprint;
    const priorId = seen.get(key);
    if (priorId !== undefined) throw new CatalogMigrationError(`product identity collision between Product ${priorId} and Product ${id} (${key})`);
    seen.set(key, id);
  }
}
function assertForeignKeysClean(database: DatabaseSync): void {
  if (database.prepare("PRAGMA foreign_key_check").all().length > 0) throw new CatalogMigrationError("foreign key check failed during catalog migration");
}
function migrateVersionOne(database: DatabaseSync): void {
  assertNoIdentityCollisions(database);
  const sellerProductCount = count(database, "SellerProduct");
  database.exec("CREATE TABLE SellerProduct__v1 (Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId TEXT NOT NULL, UNIQUE(SellerName, SellerProductId));");
  database.exec("INSERT INTO SellerProduct__v1 (Id, SellerName, ProductId, SellerProductId) SELECT Id, SellerName, ProductId, CAST(SellerProductId AS TEXT) FROM SellerProduct;");
  if (count(database, "SellerProduct__v1") !== sellerProductCount) throw new CatalogMigrationError("SellerProduct row count changed during rebuild");
  database.exec("DROP TABLE SellerProduct");
  database.exec("ALTER TABLE SellerProduct__v1 RENAME TO SellerProduct");
  database.exec("CREATE INDEX SellerProduct_ProductId_idx ON SellerProduct(ProductId)");
  database.exec("CREATE TABLE ProductIdentity (ProductId INTEGER PRIMARY KEY REFERENCES Product(Id) ON DELETE CASCADE, CanonicalizationVersion INTEGER NOT NULL, CanonicalName TEXT NOT NULL, CanonicalBrand TEXT NOT NULL, CanonicalCategory TEXT NOT NULL, CanonicalFingerprint TEXT NOT NULL UNIQUE);");
  const insertIdentity = database.prepare("INSERT INTO ProductIdentity (ProductId, CanonicalizationVersion, CanonicalName, CanonicalBrand, CanonicalCategory, CanonicalFingerprint) VALUES (?, ?, ?, ?, ?, ?)");
  for (const product of database.prepare("SELECT Id, Name, Brand, Category FROM Product ORDER BY Id").iterate()) {
    const { Id: id, Name: name, Brand: brand, Category: category } = product;
    if (typeof id !== "number" || typeof name !== "string" || (brand !== null && typeof brand !== "string") || (category !== null && typeof category !== "string")) throw new CatalogMigrationError("Product has an unsupported row shape");
    const identity = productIdentity(name, brand, category);
    insertIdentity.run(id, CANONICALIZATION_VERSION, identity.name, identity.brand, identity.category, identity.fingerprint);
  }
  if (count(database, "ProductIdentity") !== count(database, "Product")) throw new CatalogMigrationError("ProductIdentity backfill count does not match Product");
  assertForeignKeysClean(database);
  database.exec(`PRAGMA user_version = ${CATALOG_SCHEMA_VERSION}`);
}
/** Runs supported migrations inside an already-open immediate transaction. */
export function migrateCatalogDatabaseInTransaction(database: DatabaseSync): void {
  database.exec("PRAGMA foreign_keys = ON");
  const version = scalar(database, "PRAGMA user_version");
  if (typeof version !== "number") throw new CatalogMigrationError("database user_version is invalid");
  if (version > CATALOG_SCHEMA_VERSION) throw new CatalogMigrationError(`database schema version ${version} is newer than supported version ${CATALOG_SCHEMA_VERSION}`);
  if (version !== CATALOG_SCHEMA_VERSION) migrateVersionOne(database);
}
export function migrateCatalogDatabase(database: DatabaseSync): void {
  database.exec("BEGIN IMMEDIATE");
  try { migrateCatalogDatabaseInTransaction(database); database.exec("COMMIT"); } catch (error) { database.exec("ROLLBACK"); throw error; }
}
export function migrateCatalog(path: string): void {
  const database = new DatabaseSync(path, { open: true, enableForeignKeyConstraints: true });
  try { migrateCatalogDatabase(database); } finally { database.close(); }
}

class SqliteTransaction implements CatalogTransaction {
  private readonly database: DatabaseSync;
  constructor(database: DatabaseSync) { this.database = database; }
  migrate(): void { migrateCatalogDatabaseInTransaction(this.database); }
  findProductIds(fingerprint: string): readonly number[] {
    return this.database.prepare("SELECT ProductId FROM ProductIdentity WHERE CanonicalFingerprint = ? ORDER BY ProductId").all(fingerprint).map((row) => row.ProductId).filter((id): id is number => typeof id === "number");
  }
  insertProduct(entry: SellerEntry): number { return Number(this.database.prepare("INSERT INTO Product(Name, Brand, Category) VALUES (?, ?, ?)").run(entry.Name, entry.Brand, entry.Category).lastInsertRowid); }
  insertIdentity(productId: number, identity: CanonicalProductIdentity): void {
    this.database.prepare("INSERT INTO ProductIdentity(ProductId, CanonicalizationVersion, CanonicalName, CanonicalBrand, CanonicalCategory, CanonicalFingerprint) VALUES (?, ?, ?, ?, ?, ?)").run(productId, identity.normalizationVersion, identity.name, identity.brand, identity.category, identity.fingerprint);
  }
  findSellerLink(sellerName: string, sellerProductId: string): number | undefined {
    const row = this.database.prepare("SELECT ProductId FROM SellerProduct WHERE SellerName = ? AND SellerProductId = ?").get(sellerName, sellerProductId);
    return typeof row?.ProductId === "number" ? row.ProductId : undefined;
  }
  insertSellerLink(sellerName: string, productId: number, sellerProductId: string): void { this.database.prepare("INSERT INTO SellerProduct(SellerName, ProductId, SellerProductId) VALUES (?, ?, ?)").run(sellerName, productId, sellerProductId); }
  assertForeignKeysClean(): void { assertForeignKeysClean(this.database); }
}

/** SQLite adapter: owns connections, busy limits, transaction lifecycle, and rollback-only dry runs. */
export class SqliteCatalogRepository implements CatalogRepository {
  private readonly path: string;
  constructor(path: string) { this.path = path; }
  transact(dryRun: boolean, work: (transaction: CatalogTransaction) => void): void {
    const database = new DatabaseSync(this.path, { enableForeignKeyConstraints: true });
    try {
      database.exec("PRAGMA busy_timeout = 5000");
      database.exec("BEGIN IMMEDIATE");
      work(new SqliteTransaction(database));
      database.exec(dryRun ? "ROLLBACK" : "COMMIT");
    } catch (error) {
      try { database.exec("ROLLBACK"); } catch { /* transaction was not opened or was already rolled back */ }
      throw error;
    } finally { database.close(); }
  }
}

/** Convenience production entrypoint; core orchestration remains adapter independent. */
export function consolidate(input: ValidatedInput, databasePath: string, dryRun: boolean, runId: string): ConsolidationSummary {
  return new ConsolidationService(new SqliteCatalogRepository(databasePath)).consolidate(input, dryRun, runId);
}
