import type { SellerEntry, ValidatedInput } from "../domain/input.ts";
import { canonicalizeProduct } from "../domain/product-identity.ts";

export class ConsolidationError extends Error {
  readonly code: "identity_ambiguity" | "seller_link_conflict" | "database_integrity_failure";
  constructor(code: "identity_ambiguity" | "seller_link_conflict" | "database_integrity_failure", message: string) {
    super(message);
    this.code = code;
    this.name = "ConsolidationError";
  }
}

export interface CatalogTransaction {
  migrate(): void;
  findProductIds(fingerprint: string): readonly number[];
  insertProduct(entry: SellerEntry): number;
  insertIdentity(productId: number, identity: ReturnType<typeof canonicalizeProduct>): void;
  findSellerLink(sellerName: string, sellerProductId: string): number | undefined;
  insertSellerLink(sellerName: string, productId: number, sellerProductId: string): void;
  assertForeignKeysClean(): void;
}

export interface CatalogRepository {
  transact(dryRun: boolean, work: (transaction: CatalogTransaction) => void): void;
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

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareWork(left: SellerEntry, right: SellerEntry): number {
  const bySeller = compareText(left.SellerName.trim(), right.SellerName.trim());
  if (bySeller !== 0) return bySeller;
  const bySellerProductId = compareText(left.Id.trim(), right.Id.trim());
  if (bySellerProductId !== 0) return bySellerProductId;
  return compareText(
    canonicalizeProduct({ name: left.Name, brand: left.Brand, category: left.Category }).fingerprint,
    canonicalizeProduct({ name: right.Name, brand: right.Brand, category: right.Category }).fingerprint,
  );
}

/** Deterministic, adapter-independent batch orchestration. */
export class ConsolidationService {
  private readonly repository: CatalogRepository;
  private readonly now: () => number;
  constructor(repository: CatalogRepository, now: () => number = () => performance.now()) {
    this.repository = repository;
    this.now = now;
  }

  consolidate(input: ValidatedInput, dryRun: boolean, runId: string): ConsolidationSummary {
    const started = this.now();
    let matchedProducts = 0;
    let insertedProducts = 0;
    let insertedLinks = 0;
    let alreadyPresentLinks = 0;
    this.repository.transact(dryRun, (transaction) => {
      transaction.migrate();
      for (const entry of [...input.entries].sort(compareWork)) {
        const identity = canonicalizeProduct({ name: entry.Name, brand: entry.Brand, category: entry.Category });
        const candidates = transaction.findProductIds(identity.fingerprint);
        let productId: number;
        if (candidates.length > 1) throw new ConsolidationError("identity_ambiguity", "more than one product has the canonical identity");
        if (candidates.length === 1) {
          productId = candidates[0]!;
          matchedProducts++;
        } else {
          productId = transaction.insertProduct(entry);
          transaction.insertIdentity(productId, identity);
          insertedProducts++;
        }
        const sellerName = entry.SellerName.trim();
        const sellerProductId = entry.Id.trim();
        const existingProductId = transaction.findSellerLink(sellerName, sellerProductId);
        if (existingProductId !== undefined) {
          if (existingProductId !== productId) throw new ConsolidationError("seller_link_conflict", "seller entry is already linked to a different product");
          alreadyPresentLinks++;
        } else {
          transaction.insertSellerLink(sellerName, productId, sellerProductId);
          insertedLinks++;
        }
      }
      transaction.assertForeignKeysClean();
    });
    return {
      schemaVersion: 1,
      normalizationVersion: 1,
      runId,
      inputRowCount: input.inputRowCount,
      distinctSellerEntryCount: input.distinctSellerEntryCount,
      duplicateInputCount: input.duplicateInputCount,
      matchedProducts,
      insertedProducts,
      insertedLinks,
      alreadyPresentLinks,
      rejectedRows: 0,
      ambiguousRows: 0,
      elapsedMilliseconds: Math.max(0, Math.round(this.now() - started)),
      dryRun,
      databasePath: "[redacted]",
    };
  }
}
