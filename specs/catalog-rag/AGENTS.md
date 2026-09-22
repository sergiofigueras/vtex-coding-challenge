# VTEX Catalog RAG Search UI agent contract

Read `project.json`, `docs/sdd/manifest.json`, `docs/sdd/traceability.json`, every requested specification and dependency, and the `sdd-delivery` skill before editing.

- Implement only explicitly requested ready specifications; dependencies are context-only unless an acceptance criterion requires them.
- Keep requirement authorities explicit and maintain reciprocal traceability.
- Keep runtime state, credentials, private inputs, and generated transcripts under ignored `.sdd/` storage.
- Treat the supplied consolidated catalog as a read-only source of truth. Never rewrite, migrate, track, or log its contents.
- Keep projection, hashing, ranking, citation validation, HTTP validation, and UI rendering deterministic. `SDD-002` and `SDD-004` explicitly authorize network/model access only behind injected embedding and answer-provider adapters; normal tests and release gates use offline fakes.
- Never expose provider credentials, model prompts, catalog paths, raw catalog rows, or unrestricted errors to the browser. Serve UI and API from the same origin by default.
- Record RAG runtime usage separately from the delivery-engine cost ledger. Never attribute production embedding or answer calls to `engine/cost/ledger.jsonl`.
- Prefer deterministic local inspection and tests. Run narrow tests, then `npm run check`.
- Do not commit or push. Report changed files, acceptance evidence, risks, and the active change ID to the outer operator.
