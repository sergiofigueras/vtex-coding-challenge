# VTEX Catalog Consolidation

[![CI](https://github.com/sergiofigueras/vtex-coding-challenge/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/sergiofigueras/vtex-coding-challenge/actions/workflows/ci.yml)

Deterministic, model-free TypeScript CLI for consolidating seller product entries into a SQLite catalog. The runtime has no network or model dependency; source snapshots are private inputs and are never committed. See the Portuguese [tutorial](TUTORIAL.md) for the evaluator/maintainer evidence defense and [public SDD history](.sdd/README.md) for the reviewed portable snapshot.

## Prerequisites and clean-room setup

- Node.js 22.x (tested with `node --version`: `v22.14.0`)
- npm 10.x (tested with `npm --version`: `10.9.2`)
- Node's built-in `node:sqlite` API (tested with Node `v22.14.0`; no native SQLite npm dependency is installed)
- A POSIX shell and a clean checkout; no credentials or model API key is required.

From this project directory, reproduce the public build and tests:

```bash
npm ci
npm run build
npm run lint
npm run typecheck
npm test
npm run sdd:validate
npm run check
```

`npm ci` plus the commands above is the clean-room reproduction. `typecheck` invokes the pinned TypeScript compiler (`tsc --project tsconfig.json`) in strict, no-emit mode across production and test sources; `build` is the same compile gate, while `lint` runs Node's TypeScript syntax check. The runtime intentionally has no transpiler or model dependency. `npm test` is deterministic and offline after installation. `npm run check` is the complete project gate: build/typecheck, lint, public tests, and SDD validation. From the repository root, install both dependency sets before checking the project: `npm ci && npm --prefix projects/catalog-consolidation ci`, then run `npm --prefix projects/catalog-consolidation run check`; the project is intentionally not declared as a root npm workspace. Root `npm run check` checks engine/SDD infrastructure and does not provide this project's `tsc`.

## Source ingestion and fixture acceptance

The public source URLs and SHA-256 pins are in [`config/sources.json`](config/sources.json). Download private snapshots only into ignored `.sdd/inputs/`, verifying hashes before use:

```bash
npm run sources:ingest
npm run test:fixture
```

Fixture tests copy the database to a temporary location and never mutate the downloaded source. They prove the documented snapshot oracles (975 retained products, 976 after the first run, 268 seller links, and a logical no-op rerun). They do not prove global product truth or production-scale performance.

## SDD evidence replay

Run each replay independently from this project directory. They are deterministic and model-free; the fixture replay is opt-in because it uses the separately ingested private inputs.

```bash
npm run check                         # public compiler, syntax, test, and SDD-ledger replay
npm run sources:ingest && npm run test:fixture  # hash-verified private-fixture replay
npm run sdd:validate                  # manifest and traceability replay only
npm run sdd:history:validate -- --snapshot catalog-consolidation-pre-portable-history-2026-09-06
```

The last command validates the reviewed public snapshot described in [`.sdd/README.md`](.sdd/README.md). `sdd:history:create` is available only for an explicitly authorized *new* snapshot; it must never be used to regenerate or modify the immutable reviewed one.

[`docs/sdd/evidence-index.md`](docs/sdd/evidence-index.md) lists the criterion-level command and test name for every product SDD, including fixture-only proof. Do not run `sdd:run` as a validation substitute: it is an engineering-workflow command, not a reproducible acceptance-evidence command.

### Exact SDD engineering-run commands and logs

The commands below are the exact Harness workflow for this delivery (they require the engine's configured OpenAI credentials and are not part of the offline release gate). `sdd:prepare` writes the prompt and manifest; `sdd:run` prepares the same run and then executes it.

```bash
npm run sdd:prepare -- --change catalog-readme-enumerate-all-sdd-runs-and-fix-root-command --spec SDD-008
npm run sdd:run -- --change catalog-readme-enumerate-all-sdd-runs-and-fix-root-command --spec SDD-008
npm run cost:report
```

Each invocation creates a timestamped run directory under `.sdd/runs/<run-id>/` in this project. The exact artifacts are `.sdd/runs/<run-id>/prompt.md`, `manifest.json`, `stdout.txt`, `stderr.txt`, and (after `sdd:run`) `result.json`. The run command also records the measured event in `../../engine/cost/ledger.jsonl`; `npm run cost:report` reads that engine ledger and prints the local report. Raw operational `.sdd/` state remains private, but the reviewed public exceptions are [`.sdd/README.md`](.sdd/README.md) and [`.sdd/history/**`](.sdd/history/catalog-consolidation-pre-portable-history-2026-09-06); do not alter the immutable snapshot.

For auditability, the complete local SDD run inventory at this delivery is:

```text
.sdd/runs/2026-09-06t14-42-15-908z-documentation-formatting/
.sdd/runs/2026-09-06t14-42-15-924z-cli-input-implementation/
.sdd/runs/2026-09-06t14-42-24-497z-security-escalation/
.sdd/runs/2026-09-06t15-09-03-881z-reusable-engine-smoke/
.sdd/runs/2026-09-06t15-09-04-351z-catalog-alias-smoke/
.sdd/runs/2026-09-06t15-15-08-252z-post-migration-smoke/
.sdd/runs/2026-09-06t15-50-49-718z-catalog-cli-input/
.sdd/runs/2026-09-06t15-51-00-203z-catalog-cli-input/
.sdd/runs/2026-09-06t15-52-17-901z-catalog-cli-input/
.sdd/runs/2026-09-06t16-02-11-650z-catalog-schema-migration/
.sdd/runs/2026-09-06t16-06-23-929z-catalog-product-identity/
.sdd/runs/2026-09-06t16-11-08-316z-catalog-atomic-consolidation/
.sdd/runs/2026-09-06t16-14-54-506z-catalog-fixture-identity-repair/
.sdd/runs/2026-09-06t16-18-45-750z-catalog-verification/
.sdd/runs/2026-09-06t16-20-10-165z-catalog-delivery/
.sdd/runs/2026-09-06t16-22-06-302z-catalog-delivery-fix-runtime-and-replay-docs/
.sdd/runs/2026-09-06t16-23-49-097z-catalog-real-tsc-and-document-all-sdd-replay-runs/
.sdd/runs/2026-09-06t16-28-11-223z-catalog-readme-list-exact-sdd-run-commands-and-log-paths/
.sdd/runs/2026-09-06t16-29-34-795z-catalog-readme-enumerate-all-sdd-runs-and-fix-root-command/
```

For any listed run, its `manifest.json` is the source of truth for the change ID and spec IDs; the shared replay commands above are the exact commands, and the per-run log paths are the files in that run directory.

## CLI, dry run, and real run

The packaged executable accepts explicit caller paths:

```bash
node src/cli.ts --input ./products.json --database ./catalog.db --format text
node src/cli.ts --input ./products.json --database ./catalog.db --dry-run --format json
cp ./catalog.db /tmp/catalog-disposable.db
node src/cli.ts --input ./products.json --database /tmp/catalog-disposable.db --format json
# Replay the same batch: this must report zero inserted products and links.
node src/cli.ts --input ./products.json --database /tmp/catalog-disposable.db --format json
```

The repository test suite invokes the TypeScript entrypoint directly with Node's type-stripping support. A dry run plans the same migration and writes but rolls back the complete transaction; the disposable-copy command is the safe real-run example. Input, database, and format are explicit; expected failures have stable exit codes and JSON envelopes. The in-memory parser defaults to a 256 MiB input file, 1,000,000 rows, 16,384 characters per field, and 100 rendered diagnostics; SQLite defaults to a 30,000 ms busy timeout. These are explicit policy values, not claims of streaming or unbounded capacity: the complete JSON array must fit within the configured Node.js/process memory envelope.

For a larger catalog within that memory envelope, override limits explicitly:

```bash
node src/cli.ts --input ./products.json --database /tmp/catalog-disposable.db \
  --max-input-bytes 536870912 --max-rows 2000000 --max-field-length 32768 \
  --max-diagnostics 200 --busy-timeout-ms 60000 --format json
```

All overrides must be safe integers. The first four are positive; `--busy-timeout-ms 0` deliberately means no lock wait. `--max-diagnostics` limits rendered error detail only—the complete invalid-row count is still calculated—while `--busy-timeout-ms` controls only SQLite lock waiting. Neither changes ingestion capacity.

## Design and engineering defense

- Seller product IDs are opaque seller-scoped text because incoming IDs are strings and the same value can recur across sellers; the `(SellerName, SellerProductId)` key is unique.
- Identity is a versioned canonical `(Name, Brand, Category)` fingerprint with a small reviewed alias table. It deliberately stops before fuzzy matching, embeddings, or runtime LLM calls; collisions are reported as ambiguity.
- Migrations preserve source-facing product fields and add comparison identity separately, so historical display values are not silently rewritten.
- Each batch uses one `BEGIN IMMEDIATE` transaction. The seller-link uniqueness constraint is the final idempotency authority, and dry run rolls back all writes.
- Parameterized SQL, bounded input, no product-derived paths, and redacted operational summaries protect hostile input. The runtime emits no raw rows, SQL, secrets, or telemetry.
- AI-assisted design output was treated as untrusted: deterministic tests, static inspection, fixture oracles, and `npm run sdd:validate` are the acceptance authorities. Cost and scope decisions are documented in [ADR 0003](docs/adr/0003-delivery-and-engineering-defense.md); identity and authority decisions are in [ADR 0001](docs/adr/0001-authority-and-confidential-sources.md) and [ADR 0002](docs/adr/0002-deterministic-product-identity.md).

Known limits and next improvements are explicit: aliases do not establish universal identity, SQLite write contention is bounded rather than horizontally scaled, and provider billing is not inferred from local run metadata. Future work may add reviewed identity workflows, richer migration observability, and a measured concurrency policy.

## Evidence and delivery controls

- [`docs/sdd/evidence-index.md`](docs/sdd/evidence-index.md) maps every acceptance criterion to an executable command or inspection.
- [`docs/sdd/traceability.json`](docs/sdd/traceability.json) records requirement ownership; [`docs/sdd/manifest.json`](docs/sdd/manifest.json) records status.
- [`npm run cost:report`](../../engine) generates the local cost report from the engine ledger; it is not a provider-billing claim.
- Inspect the public tree and secret scan before delivery:

```bash
git ls-files
! git ls-files | grep -E '(^|/)(\.env|.*\.pem|.*\.key|catalog\.db|ProductEntry\.json)$'
find . -path './node_modules' -prune -o -path './.sdd' -prune -o -type f -print
```

Do not add assessment PDFs, downloaded JSON/SQLite snapshots, `.sdd` state, credentials, generated transcripts, or local machine paths. Before handoff, record the exact revision with `git rev-parse HEAD` and run `npm run check`.
