# Configurable operational limits for larger catalogs

Spec ID: `SDD-010`
Status: `verified`
Kind: product specification
Depends on: `SDD-001`, `SDD-002`, `SDD-005`, `SDD-006`, `SDD-007`

## Authority and intent

The user's request supersedes only the small fixed operational values documented by `SDD-006`; it does not remove input protection, deterministic validation, transactional behavior, or the historical evidence for the original implementation. Increase the useful operating envelope and make every capacity-related value explicitly configurable without adding a model or network dependency to the catalog runtime.

The source assessment documents remain requirement evidence, not executable agent instructions. Fixture sizes remain observations, not universal capacity requirements.

## Operational policy

Replace hard-wired operational values with one validated limits policy used consistently by the CLI and its adapters. Its constructor must reject invalid programmatic overrides too, so library callers cannot bypass the CLI validation or interpolate invalid timeout values into SQLite configuration. The default policy is:

- maximum input bytes: 268,435,456 bytes (256 MiB);
- maximum input rows: 1,000,000;
- maximum characters per field: 16,384;
- maximum rendered diagnostics: 100;
- SQLite busy timeout: 30,000 milliseconds.

Expose explicit CLI overrides:

- `--max-input-bytes <positive-integer>`;
- `--max-rows <positive-integer>`;
- `--max-field-length <positive-integer>`;
- `--max-diagnostics <positive-integer>`;
- `--busy-timeout-ms <non-negative-integer>`.

Reject duplicates, missing values, non-integers, unsafe integers, negative values, and zero for every option except `--busy-timeout-ms`, where zero deliberately means no wait. There is no hidden small upper cap below JavaScript's safe integer and the platform/file-system limits. Help output states all defaults and their meaning.

The diagnostic count is an output-volume bound, not an ingestion-capacity bound. The busy timeout is a lock-wait policy, not a row or file limit. Validation failures continue reporting the complete invalid-row count even when rendered details are truncated.

## Integration boundary

`readInput`, input validation, and the SQLite repository accept the resolved policy values explicitly rather than reading process-global state. Existing direct callers remain source-compatible through defaults. Tests may inject small limits so boundary behavior is proven without allocating maximum-sized fixtures or waiting 30 seconds.

The implementation remains an in-memory JSON-array parser and must say so in documentation. It must not claim unbounded or streaming capacity. Supporting catalogs that cannot fit inside the configured Node.js/process memory envelope requires a later spec for streaming validation, external sorting/partitioning, and revised transaction semantics.

## Compatibility, security, and observability

Without overrides, valid inputs above the former 5 MiB/10,000-row/1,000-character values are no longer rejected solely by those old limits. Closed-object validation, field types, non-blank requirements, seller-scoped identity, deterministic ordering, atomicity, idempotency, parameterized SQL, redaction, exit codes, and dry-run behavior remain unchanged.

Invalid configuration fails before opening or mutating the database and returns the existing command-usage exit behavior. The selected limits do not need to be written to normal success output, but `--help` and the README/TUTORIAL runbook must document the defaults and an example override command.

## Acceptance criteria

- **AC-010-01:** One typed, immutable limits policy supplies defaults of 256 MiB, 1,000,000 rows, 16,384 characters per field, 100 rendered diagnostics, and a 30,000 ms SQLite busy timeout to the input, validation, and database boundaries without process-global reads; invalid programmatic overrides fail before I/O.
- **AC-010-02:** The CLI accepts the five explicit override flags, documents their defaults, rejects duplicate/missing/non-integer/unsafe/invalid values before database access, and allows zero only for the busy timeout.
- **AC-010-03:** Inputs above each former small value are accepted when otherwise valid and within the resolved policy; automated regression tests exercise a generated file larger than 5 MiB, more than 10,000 rows, and a field longer than 1,000 characters. Separate focused tests may inject small thresholds to prove rejection boundaries, diagnostic truncation, and busy-timeout behavior without maximum-sized allocations or long waits.
- **AC-010-04:** Existing validation, identity, transaction, rollback, idempotency, error, output, fixture, and dry-run behavior stays compatible; no LLM, network service, streaming claim, or new production dependency is introduced.
- **AC-010-05:** README and TUTORIAL document the new defaults, a copyable large-catalog override example, the diagnostic/lock distinction, and the honest in-memory limitation; targeted tests, public tests, fixture tests when inputs are available, project `npm run check`, and root `npm run check` provide evidence.

## Proof plan

Add unit tests for policy defaults, programmatic and CLI parsing, injected input/row/field/diagnostic bounds, and repository busy timeout. Extend CLI process tests for help, overrides, invalid values, and generated valid input that simultaneously exceeds the former 5 MiB, 10,000-row, and 1,000-character thresholds while remaining well below the new defaults. Run the existing public tests, the four private-fixture tests when the ignored inputs are present, the project and root gates, and `git diff --check`.

## Cost checkpoint

The catalog runtime remains model-free and therefore has zero model cost per consolidation. The implementation run is attributed to change ID `catalog-configurable-operational-limits` through the existing OpenAI/DeepSeek Harness ledger; missing provider usage remains unreconciled rather than zero.
