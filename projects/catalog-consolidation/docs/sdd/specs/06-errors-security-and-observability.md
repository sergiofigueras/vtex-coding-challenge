# Errors, security, and observability

Spec ID: `SDD-006`
Status: `verified`
Kind: product specification
Depends on: `SDD-002`, `SDD-005`

## Error contract

Use stable application error codes and the exit taxonomy in `SDD-001`. Expected failures have concise messages, causal context, and no stack trace in normal output. `--format json` emits the same versioned result envelope for success and expected failure. Unexpected failures may include a stack trace only on stderr when an explicit debug flag is enabled.

At minimum distinguish malformed input, invalid row, seller-entry conflict, identity ambiguity, seller-link conflict, unsupported schema version, migration failure, database busy, and database integrity failure.

## Security controls

- Bind every SQL value through prepared statements. SQL identifiers come only from application constants.
- Do not pass fixture content through a shell, template evaluator, dynamic import, or logger format string.
- Open only paths explicitly supplied by CLI arguments; never use a product value as a path.
- Apply bounded input byte size, row count, field length, diagnostic count, and SQLite busy timeout limits.
- Never log full input rows, secrets, environment values, raw SQL, or the database contents.
- The delivered application requires no network access and no model credentials.

## Local observability

Emit a single final summary plus optional structured diagnostic records. Include safe counts, elapsed time, normalization version, schema version, dry-run state, and a generated run ID. Product names, brands, seller IDs, and filesystem paths are redacted or omitted unless a deliberate verbose-local option is documented. Do not add a remote telemetry dependency.

## Acceptance criteria

- **AC-006-01:** Every expected failure maps to a stable code and documented exit status, with no stack trace unless debug mode is explicitly enabled.
- **AC-006-02:** All data-bearing SQL is parameterized, and adversarial fixture text round-trips without changing schema or executing additional statements.
- **AC-006-03:** Logs and JSON summaries contain bounded operational metadata but no secrets, raw SQL, complete rows, or uncontrolled field values.
- **AC-006-04:** The catalog application runs with network access disabled and without OpenAI, DeepSeek, or other model credentials.

## Proof

Add static checks around repository statements, hostile-string integration tests, output snapshots, limit tests, and a test run with network calls trapped. Verify stderr/stdout separation for every exit class.

## Verification evidence

`test/sdd-errors-security-observability.test.mjs` is the acceptance evidence index:

- `AC-006-01` verifies versioned JSON failure envelopes, stable codes and exit statuses, stderr/stdout separation, and that a stack trace is emitted only with `--debug`.
- `AC-006-02` statically checks the data-bearing repository statements and runs hostile text through SQLite while confirming the `Product` table remains intact.
- `AC-006-03` checks the generated run ID, bounded metadata, default path redaction, opt-in `--verbose-local` disclosure, and the input-byte limit.
- `AC-006-04` checks the runtime source has no network or model-provider imports and executes the CLI with an environment containing no model credentials.

Run `npm run build && node --test test/sdd-errors-security-observability.test.mjs` for focused evidence. `npm run sdd:validate` validates SDD metadata. `docs/sdd/traceability.json` remains an ownership ledger because its validated schema has no evidence-index field.

## Cost checkpoint

Security-sensitive design review may use Terra. Deterministic scans and adversarial tests use no model. Sol requires an approved escalation recorded in the cost ledger.
