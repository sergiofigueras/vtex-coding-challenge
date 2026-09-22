export interface SellerEntry {
  /** Original JSON values, retained for safe binding and future insertion. */
  readonly id: string;
  readonly sellerName: string;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string;
}

export interface InputDiagnostic {
  /** One-based source index; omitted only for a malformed JSON document. */
  readonly sourceIndex?: number;
  readonly code: InputDiagnosticCode;
  readonly message: string;
}

export type InputDiagnosticCode =
  | 'E_JSON_PARSE'
  | 'E_ROOT_TYPE'
  | 'E_ROW_TYPE'
  | 'E_UNKNOWN_FIELD'
  | 'E_MISSING_FIELD'
  | 'E_FIELD_TYPE'
  | 'E_FIELD_EMPTY'
  | 'E_FIELD_LENGTH'
  | 'E_SELLER_ENTRY_CONFLICT';

export class InputValidationError extends Error {
  constructor(
    readonly invalidRowCount: number,
    readonly diagnostics: readonly InputDiagnostic[],
    readonly diagnosticsTruncated: boolean,
  ) {
    super('Input validation failed.');
    this.name = 'InputValidationError';
  }
}

export class IdentityAmbiguityError extends Error {
  constructor(readonly ambiguousCount: number) {
    super(`Identity resolution found ${ambiguousCount} ambiguous product ${ambiguousCount === 1 ? 'entry' : 'entries'}.`);
    this.name = 'IdentityAmbiguityError';
  }
}

export interface ConsolidationCounts {
  readonly inputRows: number;
  readonly distinctSellerEntries: number;
  readonly matchedProducts: number;
  readonly insertedProducts: number;
  readonly insertedLinks: number;
  readonly alreadyPresentLinks: number;
  readonly rejectedRows: number;
  readonly ambiguousRows: number;
}

export interface ValidatedInput extends ReadonlyArray<SellerEntry> {
  /** Total source rows before duplicate-input deduplication. */
  readonly inputRowCount: number;
}

export interface InputReader {
  read(bytes: string): ValidatedInput;
}

export interface CatalogProductCandidate {
  readonly id: number;
  readonly name: string;
  readonly brand: string | null;
  readonly category: string;
}

/** Read-only candidate access available inside the repository transaction. */
export interface CatalogReadPort {
  listProductCandidates(): readonly CatalogProductCandidate[];
}

export interface CatalogRepository {
  /** Legacy read-only planning boundary retained for domain-only callers. */
  withPlanningTransaction<T>(operation: (catalog: CatalogReadPort) => T): T;
  /** Atomically migrates, resolves, writes, verifies, and commits or rolls back. */
  consolidate?(entries: ValidatedInput, resolver: ProductResolver, dryRun: boolean): ConsolidationCounts;
}

export interface ProductResolver {
  resolve(entries: ValidatedInput, catalog?: readonly CatalogProductCandidate[]): readonly ProductResolution[];
  plan(entries: ValidatedInput, catalog?: readonly CatalogProductCandidate[]): ConsolidationCounts;
}

export type ProductResolution =
  | { readonly kind: 'matched'; readonly productId: number }
  | { readonly kind: 'new' }
  | { readonly kind: 'ambiguous' };

export interface Reporter {
  render(summary: ConsolidationSummary, format: OutputFormat): string;
}

export type OutputFormat = 'text' | 'json';

export interface ConsolidationSummary extends ConsolidationCounts {
  readonly version: '1';
  readonly status: 'success';
  readonly runId: string;
  readonly normalizationVersion: 1;
  readonly schemaVersion: 1;
  readonly elapsedMilliseconds: number;
  readonly dryRun: boolean;
  /** Redacted by default; only verbose-local output may disclose the supplied path. */
  readonly databasePath: string;
}

export type ApplicationErrorCode =
  | 'E_MALFORMED_INPUT'
  | 'E_INVALID_ROW'
  | 'E_SELLER_ENTRY_CONFLICT'
  | 'E_IDENTITY_AMBIGUITY'
  | 'E_SELLER_LINK_CONFLICT'
  | 'E_UNSUPPORTED_SCHEMA_VERSION'
  | 'E_MIGRATION_FAILURE'
  | 'E_DATABASE_BUSY'
  | 'E_DATABASE_INTEGRITY'
  | 'E_COMMAND_VALIDATION'
  | 'E_UNEXPECTED';

export interface FailureSummary {
  readonly version: '1';
  readonly status: 'failure';
  readonly runId: string;
  readonly code: ApplicationErrorCode;
  readonly message: string;
  readonly exitCode: 1 | 2 | 3 | 4;
  readonly elapsedMilliseconds: number;
  readonly dryRun: boolean;
  readonly diagnostics?: readonly InputDiagnostic[];
  readonly diagnosticsTruncated?: boolean;
}
