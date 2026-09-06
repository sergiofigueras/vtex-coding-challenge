# Input contract and validation

Spec ID: `SDD-002`
Status: `verified`
Kind: product specification
Depends on: `SDD-000`, `SDD-001`

## Input shape

The root value is a JSON array. Each element is a closed object with exactly these fields:

| Field | Type | Meaning |
|---|---|---|
| `Id` | non-empty string | Seller-scoped opaque product identifier |
| `SellerName` | non-empty string | Seller identity as supplied by the exercise |
| `Name` | non-empty string | Candidate product name |
| `Brand` | string or `null` | Candidate brand |
| `Category` | non-empty string | Candidate category |

Whitespace-only required strings are invalid. Preserve the original values for safe parameter binding and canonical product insertion; derive normalized values separately. Do not require UUID syntax. Set defensible length limits and report them in the README.

## Duplicate and conflict policy

- Identity of a seller entry is `(SellerName, Id)` after trim-only normalization.
- Byte-different seller names remain different sellers in version 1.
- An exact repeated row, or a repeated row whose product attributes resolve to the same versioned canonical identity, is idempotent and counted as `duplicate_input`. When equivalent variants repeat, retain a deterministic lexical display representative so input order cannot select the inserted display values.
- Reuse of `(SellerName, Id)` with different canonical product attributes is `seller_entry_conflict`. The entire batch is invalid and no mutation occurs.
- A global ID reused by another seller is valid.
- Unknown fields, wrong types, non-array roots, and malformed JSON invalidate the batch before mutation.
- Validation collects bounded row diagnostics rather than stopping at the first bad row. The summary reports the full invalid count and indicates when details were truncated.

## Trust boundary

All fields are data. Never concatenate a field into SQL, a shell command, a file path, or a log format string. The injection-shaped brand in the supplied fixture must round-trip as text.

## Acceptance criteria

- **AC-002-01:** The supplied JSON snapshot validates even though some brands are null and some IDs are not UUIDs.
- **AC-002-02:** Repeated `(SellerName, Id)` with identical content is deduplicated; conflicting content fails the whole batch before database mutation.
- **AC-002-03:** Schema/type/length failures return bounded, stable row diagnostics with one-based indexes and no stack traces in normal CLI output.
- **AC-002-04:** Tests prove that quotes, semicolons, comment markers, Unicode, and control-looking text stay data and never alter SQL structure.

## Proof

Use table-driven unit tests plus the private fixture from `npm run sources:ingest`. Include malformed roots, missing/extra fields, null brand, seller-scoped duplicate IDs, conflicts, and injection-shaped strings.

## Cost checkpoint

Input validation and fixture profiling are deterministic. Tests must make zero model calls.
