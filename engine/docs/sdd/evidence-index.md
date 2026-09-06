# SDD-095 evidence index

Focused offline evidence is split across `test/rate-limit.test.mjs` (11 tests) and `test/runner-proof.test.mjs` (5 tests; 16 focused tests total):

- `rate-limit.test.mjs` covers anchored `dsh: RATE_LIMIT:` parsing, valid-delay requirement, prose lookalikes, bounded provider-delay/backoff, Terra-to-Luna fallback, retry/exhaustion/non-retryable outcomes, accounting preservation, cancellation during countdown, and the cancelled-attempt terminal lifecycle proof;
- `runner-proof.test.mjs` exercises the production `snapshotUsageEventIdentities` and `collectUsageFromSessions(..., { excludeKeys })` functions with temporary JSONL files, proving baseline exclusion, appended-event inclusion, rapid-attempt non-double-counting, and contributor-only file results;
- `runner-proof.test.mjs` also covers import-safe active-child termination: SIGTERM on abort, injected-grace SIGKILL only while alive, no post-close SIGKILL, pre-aborted signals, and listener/timer cleanup.

The live runner persists `attempt-N.result.json`; `attempt-result.json` remains a documented compatibility alias. Cleanup is performed in `finally` around child settlement so child errors and post-settlement parsing failures do not leave monitors, abort listeners, timers, or streams active. Cancellation propagates as `success:false`, `cancelled:true`, accounting/log references, and exit 130; the lifecycle therefore never starts a second attempt.

Commands: `node --test test/rate-limit.test.mjs test/runner-proof.test.mjs` (16 focused tests), `npm test`, `npm run dsh:config`, `npm run sdd:validate -- --all`, `npm run check`, `npm --prefix projects/catalog-consolidation run check`, exact existing history validation, and `git diff --check`. Tests are offline and do not require credentials or provider access.
