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

## CLI input contract

Run `catalog-consolidate --input <products.json> --database <catalog.db> [--dry-run] [--format text|json]`. Paths are caller-relative; input and database paths are always explicit. Required string fields and a non-null `Brand` are limited to 1,000 JavaScript characters. The public validation and CLI suite is `npm test`; after `npm run sources:ingest`, the opt-in private-fixture validation is `npm run test:fixture`.
