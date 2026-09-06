# Task completion

- Run `npm run check`, `npm run dsh:config`, and `git diff --check`.
- For source-sensitive work, also run `npm run sources:ingest` and verify pinned hashes.
- Update a spec from ready to implemented/verified only with acceptance-ID evidence.
- Inspect tracked files for PDFs, fixtures, DBs, `.sdd/`, credentials, and transcripts.
- Ensure the active change has a hash-valid ledger entry and every commit has `Cost-Entry: <change-id>`.
- After push, require the GitHub Actions CI run for the exact revision to pass.
- Future product release also needs clean-clone fixture tests, cost report review, and final revision evidence.