# SDD-095 evidence index

Focused offline evidence is split across `test/rate-limit.test.mjs` (11 tests) and `test/runner-proof.test.mjs` (5 tests; 16 focused tests total):

- `rate-limit.test.mjs` covers anchored `dsh: RATE_LIMIT:` parsing, valid-delay requirement, prose lookalikes, bounded provider-delay/backoff, Terra-to-Luna fallback, retry/exhaustion/non-retryable outcomes, accounting preservation, cancellation during countdown, and the cancelled-attempt terminal lifecycle proof;
- `runner-proof.test.mjs` exercises the production `snapshotUsageEventIdentities` and `collectUsageFromSessions(..., { excludeKeys })` functions with temporary JSONL files, proving baseline exclusion, appended-event inclusion, rapid-attempt non-double-counting, and contributor-only file results;
- `runner-proof.test.mjs` also covers import-safe active-child termination: SIGTERM on abort, injected-grace SIGKILL only while alive, no post-close SIGKILL, pre-aborted signals, and listener/timer cleanup.

The live runner persists `attempt-N.result.json`; `attempt-result.json` remains a documented compatibility alias. Cleanup is performed in `finally` around child settlement so child errors and post-settlement parsing failures do not leave monitors, abort listeners, timers, or streams active. Cancellation propagates as `success:false`, `cancelled:true`, accounting/log references, and exit 130; the lifecycle therefore never starts a second attempt.

Commands: `node --test test/rate-limit.test.mjs test/runner-proof.test.mjs` (16 focused tests), `npm test`, `npm run dsh:config`, `npm run sdd:validate -- --all`, `npm run check`, `npm --prefix projects/catalog-consolidation run check`, exact existing history validation, and `git diff --check`. Tests are offline and do not require credentials or provider access.

# SDD-096 evidence index

`test/repository-policy.test.mjs` provides three focused offline tests for exact public-presentation allowlisting and published cost-trailer correction. It verifies path, kind, byte length, SHA-256, tamper rejection, missing/unlisted PDF rejection, preservation of private `.sdd`/database rules, exact commit-SHA plus observed-value matching, valid future trailers, and rejection of unlisted missing, malformed, or unknown cost entries.

`config/public-artifacts.json` is the explicit allowlist for reviewed generated presentations and is currently empty because the repository delivery is centered on source-controlled specs and Markdown documentation. `config/legacy-commit-cost-entries.json` contains exact-SHA corrections: the original malformed `Template adding` trailer, plus the published commits `2ffd8eb9dabb5ff87d0c319ce4a2c0bc859b09d8` and `8a24a3c096ab4cefc73a3ce85a79bf5396048a5e`, whose trailers were absent. Each correction maps to a known change ID in the append-only ledger; unlisted missing or malformed trailers remain invalid.

Observed commands: `node --test engine/test/repository-policy.test.mjs` (3 focused tests), root `npm run check` (48 engine tests), `npm --prefix projects/catalog-consolidation run check` (30 project tests), `node engine/scripts/validate.mjs --all`, and `git diff --check`. All passed before the delivery commit.
