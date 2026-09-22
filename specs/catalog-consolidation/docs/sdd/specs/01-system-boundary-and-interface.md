# System boundary and interface

Spec ID: `SDD-001`
Status: `ready`
Kind: product specification
Depends on: `SDD-000`

## Objective

Create a small TypeScript command-line application that consolidates one JSON input into one SQLite database. The CLI is the product boundary; no server or UI is required.

## Runtime contract

- Node.js `^22.19.0 || >=24.0.0`, TypeScript strict mode, and npm lockfile.
- Executable command:

```text
catalog-consolidate --input <products.json> --database <catalog.db> [--dry-run] [--format text|json]
```

- Paths are resolved from the caller's current directory. Neither source file is discovered implicitly.
- `--dry-run` performs the complete parse, validation, migration planning, and resolution plan against a rollback-only transaction. It must not change database bytes.
- Text is the human default. JSON emits one stable machine-readable summary on stdout. Diagnostics go to stderr.
- Exit `0` means the requested mode completed. Exit `2` means command/input validation failed. Exit `3` means an identity ambiguity prevented mutation. Exit `4` means database/migration/transaction failure. Other uncaught failures exit `1`.

## Application boundaries

Organize the future implementation into ports with replaceable adapters:

- `InputReader`: bytes to validated seller entries.
- `CatalogRepository`: migrations, candidate reads, product inserts, seller links, and transactions.
- `ProductResolver`: deterministic normalization and identity decision with evidence.
- `ConsolidationService`: batch orchestration and result taxonomy.
- `Reporter`: text or JSON rendering only.

Domain and service modules must not depend on CLI argument parsing or a concrete SQLite package.

## Result contract

The summary includes: input row count, distinct seller-entry count, matched products, inserted products, inserted links, already-present links, rejected rows, ambiguous rows, elapsed milliseconds, dry-run flag, and database path. Row-level diagnostics include a one-based source index and stable code, never a raw SQL statement.

## Non-goals

- Network service, container image, background job, authentication, telemetry backend, or ORM abstraction.
- Product implementation inside the SDD infrastructure change.

## Acceptance criteria

- **AC-001-01:** The CLI rejects missing/unreadable input and database paths before opening a write transaction and uses the specified exit codes.
- **AC-001-02:** `--dry-run` returns the same planned counts as a real run against the same starting database while leaving the database SHA-256 unchanged.
- **AC-001-03:** Domain and consolidation tests run without invoking the CLI process or a real filesystem database.
- **AC-001-04:** JSON output is parseable, versioned, stable, and free of log prose; text output remains concise and human-readable.

## Proof

Add CLI contract tests for help, invalid flags, exit codes, JSON output, and dry-run byte identity. Add dependency-boundary tests or lint rules preventing domain imports from adapters.

## Cost checkpoint

Implement this spec in one change. The default OpenAI Terra route is appropriate; Luna may handle mechanical follow-up and Sol requires a recorded approval.
