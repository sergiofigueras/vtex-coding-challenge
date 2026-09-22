import { IdentityAmbiguityError } from '../domain/contracts.js';
import type {
  CatalogProductCandidate,
  ConsolidationCounts,
  ProductResolver,
  ValidatedInput,
} from '../domain/contracts.js';
import {
  resolveProducts,
  type IdentityCatalogProduct,
  type Resolution,
} from '../domain/product-identity.js';

/** Deterministic, model-free SDD-004 identity planner. Persistence remains SDD-005. */
export class DeterministicProductResolver implements ProductResolver {
  resolve(entries: ValidatedInput, catalog: readonly IdentityCatalogProduct[] = []): readonly Resolution[] {
    return resolveProducts(entries, catalog);
  }

  plan(entries: ValidatedInput, catalog: readonly CatalogProductCandidate[] = []): ConsolidationCounts {
    const resolutions = this.resolve(entries, catalog);
    const ambiguousRows = resolutions.filter((resolution) => resolution.kind === 'ambiguous').length;
    if (ambiguousRows > 0) throw new IdentityAmbiguityError(ambiguousRows);
    return {
      inputRows: entries.inputRowCount,
      distinctSellerEntries: entries.length,
      matchedProducts: resolutions.filter((resolution) => resolution.kind === 'matched').length,
      insertedProducts: resolutions.filter((resolution) => resolution.kind === 'new').length,
      insertedLinks: 0,
      alreadyPresentLinks: 0,
      rejectedRows: 0,
      ambiguousRows,
    };
  }
}
