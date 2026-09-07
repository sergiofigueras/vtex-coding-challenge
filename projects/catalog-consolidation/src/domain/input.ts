import { canonicalizeProduct } from "./product-identity.ts";
import { DEFAULT_OPERATIONAL_LIMITS, withOperationalLimits, type OperationalLimits } from "./operational-limits.ts";

export interface SellerEntry {
  readonly Id: string;
  readonly SellerName: string;
  readonly Name: string;
  readonly Brand: string | null;
  readonly Category: string;
}

export interface RowDiagnostic {
  readonly index: number;
  readonly code: string;
  readonly message: string;
}

export interface ValidatedInput {
  readonly entries: readonly SellerEntry[];
  readonly inputRowCount: number;
  readonly distinctSellerEntryCount: number;
  readonly duplicateInputCount: number;
}

export interface ValidationFailure {
  readonly invalidCount: number;
  readonly diagnostics: readonly RowDiagnostic[];
  readonly diagnosticsTruncated: boolean;
}

export type ValidationResult =
  | { readonly ok: true; readonly value: ValidatedInput }
  | { readonly ok: false; readonly error: ValidationFailure };

const FIELDS = ["Id", "SellerName", "Name", "Brand", "Category"] as const;

function diagnostic(index: number, code: string, message: string): RowDiagnostic {
  return { index, code, message };
}

function stableValue(entry: SellerEntry): string {
  // Equivalent variants of a repeated seller entry represent the same product identity.
  return canonicalizeProduct({ name: entry.Name, brand: entry.Brand, category: entry.Category }).fingerprint;
}

function compareOriginalAttributes(left: SellerEntry, right: SellerEntry): number {
  const leftValue = JSON.stringify([left.Name, left.Brand, left.Category]);
  const rightValue = JSON.stringify([right.Name, right.Brand, right.Category]);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

/** Encodes a seller-scoped opaque identifier without reserving a separator character. */
function sellerEntryKey(entry: Pick<SellerEntry, "SellerName" | "Id">): string {
  return JSON.stringify([entry.SellerName.trim(), entry.Id.trim()]);
}

function addDiagnostic(diagnostics: RowDiagnostic[], value: RowDiagnostic, limits: OperationalLimits): void {
  if (diagnostics.length < limits.maxDiagnostics) diagnostics.push(value);
}

function validateRow(value: unknown, index: number, limits: OperationalLimits): SellerEntry | RowDiagnostic {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return diagnostic(index, "invalid_row_type", "row must be an object");
  }
  const row = value as Record<string, unknown>;
  const keys = Object.keys(row).sort();
  if (keys.length !== FIELDS.length || keys.some((key, i) => key !== [...FIELDS].sort()[i])) {
    return diagnostic(index, "invalid_fields", "row must contain exactly Id, SellerName, Name, Brand, and Category");
  }
  for (const field of ["Id", "SellerName", "Name", "Category"] as const) {
    const fieldValue = row[field];
    if (typeof fieldValue !== "string") return diagnostic(index, "invalid_type", `${field} must be a string`);
    if (fieldValue.trim().length === 0) return diagnostic(index, "invalid_value", `${field} must not be whitespace only`);
    if (fieldValue.length > limits.maxFieldLength) return diagnostic(index, "length_exceeded", `${field} exceeds ${limits.maxFieldLength} characters`);
  }
  if (row.Brand !== null && typeof row.Brand !== "string") {
    return diagnostic(index, "invalid_type", "Brand must be a string or null");
  }
  if (typeof row.Brand === "string" && row.Brand.length > limits.maxFieldLength) {
    return diagnostic(index, "length_exceeded", `Brand exceeds ${limits.maxFieldLength} characters`);
  }
  return {
    Id: row.Id as string,
    SellerName: row.SellerName as string,
    Name: row.Name as string,
    Brand: row.Brand as string | null,
    Category: row.Category as string,
  };
}

export function parseAndValidateInput(bytes: string, limits: OperationalLimits = DEFAULT_OPERATIONAL_LIMITS): ValidationResult {
  limits = withOperationalLimits(limits);
  let root: unknown;
  try {
    root = JSON.parse(bytes);
  } catch {
    return { ok: false, error: { invalidCount: 1, diagnostics: [diagnostic(0, "malformed_json", "input is not valid JSON")], diagnosticsTruncated: false } };
  }
  if (!Array.isArray(root)) {
    return { ok: false, error: { invalidCount: 1, diagnostics: [diagnostic(0, "invalid_root", "root must be an array")], diagnosticsTruncated: false } };
  }
  if (root.length > limits.maxRows) {
    return { ok: false, error: { invalidCount: 1, diagnostics: [diagnostic(0, "row_limit_exceeded", `input exceeds ${limits.maxRows} rows`)], diagnosticsTruncated: false } };
  }

  const diagnostics: RowDiagnostic[] = [];
  const entries: SellerEntry[] = [];
  const seen = new Map<string, { readonly content: string; readonly entryIndex: number }>();
  let invalidCount = 0;
  let duplicates = 0;
  for (const [zeroIndex, value] of root.entries()) {
    const index = zeroIndex + 1;
    const row = validateRow(value, index, limits);
    if ("code" in row) {
      invalidCount++;
      addDiagnostic(diagnostics, row, limits);
      continue;
    }
    const key = sellerEntryKey(row);
    const existing = seen.get(key);
    const content = stableValue(row);
    if (existing === undefined) {
      seen.set(key, { content, entryIndex: entries.length });
      entries.push(row);
    } else if (existing.content === content) {
      duplicates++;
      // The retained display row is stable even when equivalent variants arrive reordered.
      const retained = entries[existing.entryIndex]!;
      if (compareOriginalAttributes(row, retained) < 0) entries[existing.entryIndex] = row;
    } else {
      invalidCount++;
      addDiagnostic(diagnostics, diagnostic(index, "seller_entry_conflict", "seller entry conflicts with an earlier row"), limits);
    }
  }
  if (invalidCount > 0) {
    return { ok: false, error: { invalidCount, diagnostics, diagnosticsTruncated: invalidCount > diagnostics.length } };
  }
  return { ok: true, value: { entries, inputRowCount: root.length, distinctSellerEntryCount: entries.length, duplicateInputCount: duplicates } };
}
