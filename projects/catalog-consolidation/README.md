# VTEX Catalog Consolidation

This project directory contains the product specifications, requirement traceability, source manifest, architectural decisions, and—after later SDD runs—the deterministic catalog application. The reusable agent runtime lives in [`../../engine`](../../engine).

From the repository root:

```bash
npm ci
npm run sources:ingest
npm run sdd:prepare -- --change cli-input-implementation --spec SDD-001,SDD-002
npm run check
```

The root convenience commands select `catalog-consolidation` automatically. Generic engine commands accept `--project catalog-consolidation` explicitly.

The product specification graph is [`docs/sdd/manifest.json`](docs/sdd/manifest.json), requirement ownership is [`docs/sdd/traceability.json`](docs/sdd/traceability.json), and the source snapshots are pinned in [`config/sources.json`](config/sources.json). Raw source bytes and Harness run state remain under ignored `.sdd/` storage.

## Product identity

Product resolution is deterministic and model-free: version 1 compares the canonical `(Name, Brand, Category)` key defined in [`src/domain/product-identity.ts`](src/domain/product-identity.ts). It removes comparison-only Unicode marks and quote variants, normalizes punctuation and whitespace, and then applies the exact, field-specific reviewed aliases in [`src/domain/product-aliases.json`](src/domain/product-aliases.json). A missing canonical key is new; more than one matching catalog product is an ambiguity, never an arbitrary match. See [ADR 0002](docs/adr/0002-deterministic-product-identity.md) for the deliberate choice against fuzzy or model-time matching. Run `npm test` for public evidence and, after source ingestion, `npm run test:fixture` for the private resolution oracle.

## CLI input contract

Run `catalog-consolidate --input <products.json> --database <catalog.db> [--dry-run] [--format text|json]`. Paths are caller-relative; input and database paths are always explicit. Required string fields and a non-null `Brand` are limited to 1,000 JavaScript characters. The public validation and CLI suite is `npm test`; after `npm run sources:ingest`, the opt-in private-fixture validation is `npm run test:fixture`.

## Atomic consolidation and safe operation

Each validated batch is sorted deterministically and runs migrations, resolution, product writes, and seller-link writes in one SQLite `BEGIN IMMEDIATE` transaction. The seller-link uniqueness constraint is the final idempotency authority. `--dry-run` executes the same plan and deliberately rolls the complete transaction back. The public suite covers matches, new products, hostile text as data, idempotent reruns, link conflicts, and rollback.

Expected failures use stable codes and exit statuses: command/input failures are `2`, identity ambiguity is `3`, and migration, integrity, busy, or other database failures are `4`. With `--format json`, expected failures emit a versioned JSON error envelope on stdout and diagnostics stay off stdout. A generated run ID, bounded counts, schema version, and normalization version are emitted for successful JSON summaries; product data and raw SQL are never logged. `--debug` is the only mode that writes an unexpected error stack to stderr. Input files are limited to 5 MiB; fields are limited to 1,000 characters and row diagnostics to 20.
