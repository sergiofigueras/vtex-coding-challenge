import { DatabaseSync } from "node:sqlite";
import type { ValidatedInput } from "../domain/input.ts";
import { canonicalizeProduct } from "../domain/product-identity.ts";
import { CATALOG_SCHEMA_VERSION, migrateCatalogDatabaseInTransaction } from "../adapters/sqlite-catalog.ts";

export class ConsolidationError extends Error {
  readonly code: "identity_ambiguity" | "seller_link_conflict" | "database_integrity_failure";
  constructor(code: "identity_ambiguity" | "seller_link_conflict" | "database_integrity_failure", message: string) {
    super(message);
    this.code = code;
    this.name = "ConsolidationError";
  }
}

export interface ConsolidationSummary {
  readonly schemaVersion: 1;
  readonly normalizationVersion: number;
  readonly runId: string;
  readonly inputRowCount: number;
  readonly distinctSellerEntryCount: number;
  readonly duplicateInputCount: number;
  readonly matchedProducts: number;
  readonly insertedProducts: number;
  readonly insertedLinks: number;
  readonly alreadyPresentLinks: number;
  readonly rejectedRows: number;
  readonly ambiguousRows: number;
  readonly elapsedMilliseconds: number;
  readonly dryRun: boolean;
  readonly databasePath: string;
}

/** Imports a validated batch atomically. All dynamic values are SQL parameters. */
export function consolidate(input: ValidatedInput, databasePath: string, dryRun: boolean, runId: string, elapsedMilliseconds: number): ConsolidationSummary {
  const database = new DatabaseSync(databasePath, { enableForeignKeyConstraints: true });
  let matchedProducts = 0;
  let insertedProducts = 0;
  let insertedLinks = 0;
  let alreadyPresentLinks = 0;
  try {
    database.exec("PRAGMA busy_timeout = 5000");
    database.exec("BEGIN IMMEDIATE");
    migrateCatalogDatabaseInTransaction(database);
    const getIdentity = database.prepare("SELECT ProductId FROM ProductIdentity WHERE CanonicalFingerprint = ? ORDER BY ProductId");
    const insertProduct = database.prepare("INSERT INTO Product(Name, Brand, Category) VALUES (?, ?, ?)");
    const insertIdentity = database.prepare("INSERT INTO ProductIdentity(ProductId, CanonicalizationVersion, CanonicalName, CanonicalBrand, CanonicalCategory, CanonicalFingerprint) VALUES (?, ?, ?, ?, ?, ?)");
    const getLink = database.prepare("SELECT ProductId FROM SellerProduct WHERE SellerName = ? AND SellerProductId = ?");
    const insertLink = database.prepare("INSERT INTO SellerProduct(SellerName, ProductId, SellerProductId) VALUES (?, ?, ?)");
    const work = [...input.entries].sort((left, right) => {
      const l = `${left.SellerName.trim()}\u0000${left.Id.trim()}\u0000${canonicalizeProduct({ name: left.Name, brand: left.Brand, category: left.Category }).fingerprint}`;
      const r = `${right.SellerName.trim()}\u0000${right.Id.trim()}\u0000${canonicalizeProduct({ name: right.Name, brand: right.Brand, category: right.Category }).fingerprint}`;
      return l.localeCompare(r, "en");
    });
    for (const entry of work) {
      const identity = canonicalizeProduct({ name: entry.Name, brand: entry.Brand, category: entry.Category });
      const candidates = getIdentity.all(identity.fingerprint).map((row) => row.ProductId).filter((id): id is number => typeof id === "number");
      let productId: number;
      if (candidates.length > 1) throw new ConsolidationError("identity_ambiguity", "more than one product has the canonical identity");
      if (candidates.length === 1) {
        productId = candidates[0]!;
        matchedProducts++;
      } else {
        const result = insertProduct.run(entry.Name, entry.Brand, entry.Category);
        productId = Number(result.lastInsertRowid);
        insertIdentity.run(productId, identity.normalizationVersion, identity.name, identity.brand, identity.category, identity.fingerprint);
        insertedProducts++;
      }
      const existing = getLink.get(entry.SellerName.trim(), entry.Id.trim());
      if (existing !== undefined) {
        if (existing.ProductId !== productId) throw new ConsolidationError("seller_link_conflict", "seller entry is already linked to a different product");
        alreadyPresentLinks++;
      } else {
        insertLink.run(entry.SellerName.trim(), productId, entry.Id.trim());
        insertedLinks++;
      }
    }
    if (database.prepare("PRAGMA foreign_key_check").all().length > 0) throw new ConsolidationError("database_integrity_failure", "foreign key check failed");
    if (dryRun) database.exec("ROLLBACK"); else database.exec("COMMIT");
    return { schemaVersion: CATALOG_SCHEMA_VERSION, normalizationVersion: 1, runId, inputRowCount: input.inputRowCount, distinctSellerEntryCount: input.distinctSellerEntryCount, duplicateInputCount: input.duplicateInputCount, matchedProducts, insertedProducts, insertedLinks, alreadyPresentLinks, rejectedRows: 0, ambiguousRows: 0, elapsedMilliseconds, dryRun, databasePath: "[redacted]" };
  } catch (error) {
    try { database.exec("ROLLBACK"); } catch { /* no transaction to roll back */ }
    throw error;
  } finally {
    database.close();
  }
}
