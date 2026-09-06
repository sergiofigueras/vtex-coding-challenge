export const MAX_FIELD_LENGTH = 1_000;
export const MAX_DIAGNOSTICS = 20;

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

function duplicateComparisonValue(value: string | null): string | null {
  return value === null ? null : value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

function stableValue(entry: SellerEntry): string {
  return JSON.stringify([duplicateComparisonValue(entry.Name), duplicateComparisonValue(entry.Brand), duplicateComparisonValue(entry.Category)]);
}

function addDiagnostic(diagnostics: RowDiagnostic[], value: RowDiagnostic): void {
  if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(value);
}

function validateRow(value: unknown, index: number): SellerEntry | RowDiagnostic {
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
    if (fieldValue.length > MAX_FIELD_LENGTH) return diagnostic(index, "length_exceeded", `${field} exceeds ${MAX_FIELD_LENGTH} characters`);
  }
  if (row.Brand !== null && typeof row.Brand !== "string") {
    return diagnostic(index, "invalid_type", "Brand must be a string or null");
  }
  if (typeof row.Brand === "string" && row.Brand.length > MAX_FIELD_LENGTH) {
    return diagnostic(index, "length_exceeded", `Brand exceeds ${MAX_FIELD_LENGTH} characters`);
  }
  return row as SellerEntry;
}

export function parseAndValidateInput(bytes: string): ValidationResult {
  let root: unknown;
  try {
    root = JSON.parse(bytes);
  } catch {
    return { ok: false, error: { invalidCount: 1, diagnostics: [diagnostic(0, "malformed_json", "input is not valid JSON")], diagnosticsTruncated: false } };
  }
  if (!Array.isArray(root)) {
    return { ok: false, error: { invalidCount: 1, diagnostics: [diagnostic(0, "invalid_root", "root must be an array")], diagnosticsTruncated: false } };
  }

  const diagnostics: RowDiagnostic[] = [];
  const entries: SellerEntry[] = [];
  const seen = new Map<string, string>();
  let invalidCount = 0;
  let duplicates = 0;
  for (const [zeroIndex, value] of root.entries()) {
    const index = zeroIndex + 1;
    const row = validateRow(value, index);
    if ("code" in row) {
      invalidCount++;
      addDiagnostic(diagnostics, row);
      continue;
    }
    const key = `${row.SellerName.trim()}\u0000${row.Id.trim()}`;
    const existing = seen.get(key);
    const content = stableValue(row);
    if (existing === undefined) {
      seen.set(key, content);
      entries.push(row);
    } else if (existing === content) {
      duplicates++;
    } else {
      invalidCount++;
      addDiagnostic(diagnostics, diagnostic(index, "seller_entry_conflict", "seller entry conflicts with an earlier row"));
    }
  }
  if (invalidCount > 0) {
    return { ok: false, error: { invalidCount, diagnostics, diagnosticsTruncated: invalidCount > diagnostics.length } };
  }
  return { ok: true, value: { entries, inputRowCount: root.length, distinctSellerEntryCount: entries.length, duplicateInputCount: duplicates } };
}
