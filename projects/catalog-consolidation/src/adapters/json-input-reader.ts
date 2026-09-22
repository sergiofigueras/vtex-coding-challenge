import {
  InputValidationError,
  type InputDiagnostic,
  type InputReader,
  type SellerEntry,
  type ValidatedInput,
} from '../domain/contracts.js';

const REQUIRED_STRING_FIELDS = ['Id', 'SellerName', 'Name', 'Category'] as const;
const ALLOWED_FIELDS = ['Id', 'SellerName', 'Name', 'Brand', 'Category'] as const;
const MAX_DIAGNOSTICS = 20;

/** Limits prevent unbounded in-memory inputs while allowing normal catalog data. */
export const INPUT_FIELD_LIMITS = {
  Id: 512,
  SellerName: 512,
  Name: 2048,
  Brand: 2048,
  Category: 2048,
} as const;

type InputField = keyof typeof INPUT_FIELD_LIMITS;
type JsonRow = Record<string, unknown>;

function addDiagnostic(
  diagnostics: InputDiagnostic[],
  invalidRows: Set<number>,
  diagnostic: InputDiagnostic,
): void {
  invalidRows.add(diagnostic.sourceIndex ?? 0);
  if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push(diagnostic);
}

function valueError(sourceIndex: number, code: InputDiagnostic['code'], message: string): InputDiagnostic {
  return { sourceIndex, code, message };
}

function isAllowedField(field: string): field is InputField {
  return (ALLOWED_FIELDS as readonly string[]).includes(field);
}

function hasRequiredFields(row: JsonRow, sourceIndex: number, diagnostics: InputDiagnostic[], invalidRows: Set<number>): boolean {
  let valid = true;
  for (const field of REQUIRED_STRING_FIELDS) {
    if (!(field in row)) {
      addDiagnostic(diagnostics, invalidRows, valueError(sourceIndex, 'E_MISSING_FIELD', `Missing required field ${field}.`));
      valid = false;
    }
  }
  if (!('Brand' in row)) {
    addDiagnostic(diagnostics, invalidRows, valueError(sourceIndex, 'E_MISSING_FIELD', 'Missing required field Brand.'));
    valid = false;
  }
  return valid;
}

function validateField(
  row: JsonRow,
  field: InputField,
  sourceIndex: number,
  diagnostics: InputDiagnostic[],
  invalidRows: Set<number>,
): boolean {
  const value = row[field];
  if (field === 'Brand' && value === null) return true;
  if (typeof value !== 'string') {
    addDiagnostic(diagnostics, invalidRows, valueError(sourceIndex, 'E_FIELD_TYPE', `${field} must be a string${field === 'Brand' ? ' or null' : ''}.`));
    return false;
  }
  if (field !== 'Brand' && value.trim().length === 0) {
    addDiagnostic(diagnostics, invalidRows, valueError(sourceIndex, 'E_FIELD_EMPTY', `${field} must not be empty or whitespace-only.`));
    return false;
  }
  if (value.length > INPUT_FIELD_LIMITS[field]) {
    addDiagnostic(diagnostics, invalidRows, valueError(sourceIndex, 'E_FIELD_LENGTH', `${field} exceeds the ${INPUT_FIELD_LIMITS[field]} character limit.`));
    return false;
  }
  return true;
}

function canonicalProductAttribute(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLocaleLowerCase('en-US')
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

/** Version-1 canonical form is used only for duplicate-input conflict detection. */
function canonicalProductKey(entry: SellerEntry): string {
  return [entry.name, entry.brand ?? '', entry.category].map(canonicalProductAttribute).join('\u0000');
}

function displayKey(entry: SellerEntry): string {
  return JSON.stringify([entry.sellerName, entry.id, entry.name, entry.brand, entry.category]);
}

function sellerEntryKey(entry: SellerEntry): string {
  return `${entry.sellerName.trim()}\u0000${entry.id.trim()}`;
}

/** Validates all rows before returning any entry, so callers cannot mutate on invalid input. */
export class JsonInputReader implements InputReader {
  read(bytes: string): ValidatedInput {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bytes);
    } catch {
      throw new InputValidationError(1, [{ code: 'E_JSON_PARSE', message: 'Input is not valid JSON.' }], false);
    }
    if (!Array.isArray(parsed)) {
      throw new InputValidationError(1, [{ code: 'E_ROOT_TYPE', message: 'Input root must be a JSON array.' }], false);
    }

    const diagnostics: InputDiagnostic[] = [];
    const invalidRows = new Set<number>();
    const entries: SellerEntry[] = [];
    const sourceIndexes = new Map<SellerEntry, number>();

    for (const [zeroBasedIndex, row] of parsed.entries()) {
      const sourceIndex = zeroBasedIndex + 1;
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        addDiagnostic(diagnostics, invalidRows, valueError(sourceIndex, 'E_ROW_TYPE', 'Row must be an object.'));
        continue;
      }
      const candidate = row as JsonRow;
      let valid = hasRequiredFields(candidate, sourceIndex, diagnostics, invalidRows);
      for (const field of Object.keys(candidate)) {
        if (!isAllowedField(field)) {
          addDiagnostic(diagnostics, invalidRows, valueError(sourceIndex, 'E_UNKNOWN_FIELD', `Unknown field ${field}.`));
          valid = false;
        }
      }
      for (const field of ALLOWED_FIELDS) {
        if (field in candidate && !validateField(candidate, field, sourceIndex, diagnostics, invalidRows)) valid = false;
      }
      if (valid) {
        const entry: SellerEntry = {
          id: candidate.Id as string,
          sellerName: candidate.SellerName as string,
          name: candidate.Name as string,
          brand: candidate.Brand as string | null,
          category: candidate.Category as string,
        };
        entries.push(entry);
        sourceIndexes.set(entry, sourceIndex);
      }
    }

    const bySellerEntry = new Map<string, SellerEntry>();
    for (const entry of entries) {
      const key = sellerEntryKey(entry);
      const existing = bySellerEntry.get(key);
      if (existing === undefined) {
        bySellerEntry.set(key, entry);
      } else if (canonicalProductKey(existing) !== canonicalProductKey(entry)) {
        const sourceIndex = sourceIndexes.get(entry);
        if (sourceIndex !== undefined) {
          addDiagnostic(diagnostics, invalidRows, valueError(sourceIndex, 'E_SELLER_ENTRY_CONFLICT', 'Seller entry is reused with different product attributes.'));
        }
      } else if (displayKey(entry).localeCompare(displayKey(existing)) < 0) {
        // A lexical representative prevents source order from selecting display data.
        bySellerEntry.set(key, entry);
      }
    }

    if (invalidRows.size > 0) {
      throw new InputValidationError(invalidRows.size, diagnostics, invalidRows.size > diagnostics.length);
    }

    const deduplicated = [...bySellerEntry.values()].sort((left, right) => {
      const byIdentity = sellerEntryKey(left).localeCompare(sellerEntryKey(right));
      return byIdentity !== 0 ? byIdentity : displayKey(left).localeCompare(displayKey(right));
    });
    return Object.assign(deduplicated, { inputRowCount: parsed.length });
  }
}
