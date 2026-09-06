import type { ValidatedInput } from "../domain/input.ts";

export interface ConsolidationSummary {
  readonly schemaVersion: 1;
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

/** SDD-003+ own catalog migrations and mutation; this slice provides deterministic input planning. */
export function planConsolidation(input: ValidatedInput, databasePath: string, dryRun: boolean, elapsedMilliseconds: number): ConsolidationSummary {
  return {
    schemaVersion: 1,
    inputRowCount: input.inputRowCount,
    distinctSellerEntryCount: input.distinctSellerEntryCount,
    duplicateInputCount: input.duplicateInputCount,
    matchedProducts: 0,
    insertedProducts: 0,
    insertedLinks: 0,
    alreadyPresentLinks: 0,
    rejectedRows: 0,
    ambiguousRows: 0,
    elapsedMilliseconds,
    dryRun,
    databasePath,
  };
}
