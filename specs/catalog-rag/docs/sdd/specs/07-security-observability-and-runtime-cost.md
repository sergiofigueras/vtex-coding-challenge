# Security, observability, and runtime cost controls

Spec ID: `SDD-007`
Status: `ready`
Kind: product specification
Depends on: `SDD-002`, `SDD-004`, `SDD-005`, `SDD-006`

## Configuration and secrets

Validate one immutable runtime configuration before opening a listener, database writer, or provider connection. Document conservative defaults: loopback host, 16 KiB HTTP body, 500-code-point query, 256-code-point filter values, `topK` 8 with maximum 20, 30-second provider deadline, at most one bounded retry for explicitly retryable failures, four concurrent generations, bounded evidence bytes, and bounded output tokens.

Provider secrets enter only through environment variables or an injected secret source. They are never accepted in browser requests, committed configuration, command arguments, sidecar metadata, logs, errors, snapshots, prompts, or test fixtures. Invalid or missing required configuration fails before network access.

## Safe telemetry and cost

Emit structured operational events containing timestamp, opaque request/build ID, event name, status/error code, stage duration, result count, provider/model identity when safe, and usage counts when the provider supplies them. Do not log raw query text, projected content, evidence, answers, vectors, IP address, full provider payload, secret, or absolute database path by default.

Store application runtime usage under ignored `projects/catalog-rag/.sdd/runtime/` state or the specified safe sidecar fields. Distinguish embedding-index cost from per-question embedding and answer cost. Where provider price or usage is unknown, mark it `unavailable`; never substitute zero. The engine `cost/ledger.jsonl` remains exclusively the cost of SDD/Harness software delivery.

## Resilience and lifecycle

Bound queue length and concurrency. Propagate cancellation and deadlines. Retry only documented transient failures with bounded backoff and no model/provider switching. Shut down in order: stop accepting work, cancel or drain bounded in-flight work, finalize safe usage records, close sidecar/catalog handles, and exit with a stable code. Recovery never promotes a partial index.

## Acceptance criteria

- **AC-007-01:** Provider secrets are accepted only through environment variables or an injected secret source and never committed, returned to clients, included in command arguments, or written to logs, prompts, sidecar metadata, tests, or runtime usage records.
- **AC-007-02:** Validated configuration bounds request bytes, query and filter lengths, `topK`, evidence size, provider timeout, output, retries, queue length, and concurrent generation; documented defaults fail closed when invalid.
- **AC-007-03:** Structured logs correlate opaque request/build IDs, stable state/error codes, durations, result counts, and provider usage when available without raw queries, evidence, answers, vectors, credentials, IP addresses, or absolute database paths.
- **AC-007-04:** Runtime embedding and answer usage is stored under ignored project state, separates indexing from question answering, represents unknown usage or cost as unavailable, and is explicitly distinct from the engine SDD delivery ledger.
- **AC-007-05:** Timeout, cancellation, overload, transient retry, provider failure, process signal, and restart tests prove bounded work, deterministic cleanup, no provider switching, preservation of the last ready index, and no sensitive output.

## Proof plan

Use injected clock, fake secrets, fake providers, in-memory log sink, temporary files, and process-level lifecycle tests. Run secret-canary scans over logs, errors, generated assets, snapshots, sidecar metadata, and test output. Verify overload, queueing, one retry, cancellation, graceful shutdown, and usage-unavailable cases offline.

## Cost checkpoint

This specification creates the application runtime cost report. It must not alter, backfill, or reinterpret the engine delivery ledger.
