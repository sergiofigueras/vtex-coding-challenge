# Bounded OpenAI rate-limit resilience for SDD delivery

Spec ID: `SDD-095`
Status: `verified`
Kind: infrastructure specification
Depends on: `SDD-090`, `SDD-091`, `SDD-092`, `SDD-093`, `SDD-094`

## Objective and boundary

The deterministic catalog runtime is explicitly outside this feature: it never calls a model and therefore cannot receive OpenAI/Harness model rate limits. This specification applies only to the reusable SDD delivery engine and its live `project:run` Harness lifecycle. It must make an interrupted delivery resumable without changing the selected project, change ID, requested spec IDs, dependency closure, or the operator's partial working tree.

The implementation is bounded and fail-closed. It must not promise provider availability, hide repeated failures, or turn arbitrary errors into retries.

## Failure recognition and retry policy

Only a provider/Harness rate-limit failure is retryable: an error classified as HTTP `429` or a known `RATE_LIMIT` code/type, with a structured or otherwise known retry delay when supplied. Classification must be conservative and documented; authentication, invalid request, network/transport, server, budget, reconciliation, process, validation, quota, and unknown failures are not retried unless the provider explicitly identifies them as the supported rate-limit condition. A persistent quota failure is terminal, not an invitation to loop.

The runner exposes bounded configuration for maximum attempts (including the initial attempt), exponential backoff base, maximum delay, and jitter. Provider `Retry-After`/structured delay has precedence over calculated backoff; both are clamped to the configured maximum. The test-injected clock, sleeper, and deterministic jitter source make boundaries reproducible. Countdown/status events show the reason, attempt number, selected delay, and next action, and remain visible while waiting. Prompt cancellation interrupts waiting and terminates the active child safely without starting another attempt.

Each retry starts a new persisted Harness session/attempt with explicit resume context (same project/change/spec scope, prior attempt outcome, partial-tree preservation, and recovery instructions), separate stdout/stderr/session references, and an attempt record. The existing single-run lock remains held for the entire retry lifecycle. No retry may reset, stash, discard, or overwrite unrelated working-tree changes.

## Routing and operator authorization

The default route remains Terra. An explicit operator opt-in may authorize one fallback from default Terra to economy Luna only, for the same scope and within the same run/change budgets. The fallback is visible in status and final metadata, separately costed, and rejected unless the task/operator authorization is present. It must never silently select or escalate to Sol; Sol remains governed by the existing explicit escalation approval and is not a rate-limit fallback.

## Cost, budgets, and final state

Reserve and settle cost for every attempt, including attempts that fail before a successful response. Provider-reported usage from a failed attempt is billable. Missing usage is `unreconciled` and retains its conservative reservation; it is never represented as zero or silently released. Before every further provider call, enforce both the cumulative run budget and cumulative change budget, accounting for all settled and outstanding reservations. A retry or fallback that cannot pass either gate stops before the call.

The final result metadata and ledger linkage enumerate every attempt, attempt/session identifier, route/model, classification and reason, provider delay and calculated backoff, actual wait, authorization, usage/accounting status, reservation/settlement identifiers, cumulative budget decision, and terminal outcome. On exhaustion or persistent quota failure, preserve resumable state and partial work, return a stable nonzero exit code, and print an actionable message identifying the next operator action (resume later, adjust provider capacity, or explicitly authorize the permitted fallback); it must not claim that the provider will become available.

## Documentation and test contract

Implementation must update the root `engine/README.md` and the catalog project's Portuguese catalog tutorial with the deterministic-runtime boundary and the operational command/procedure for observing, resuming, and explicitly authorizing the bounded recovery. This documentation does not authorize modifying project `SDD-009` in this change.

Add deterministic offline tests for: delay parsing; exponential-backoff and maximum-delay boundaries; successful retry; exhaustion; non-retryable errors; cancellation during countdown and active child handling; fallback authorization and Terra-only-to-Luna-only routing; cumulative run/change budget gates; failed-attempt billing; unknown usage reservation/reconciliation; lock retention; scope/partial-tree preservation; separate sessions/logs; and complete final attempt metadata. Tests must not call a provider or require credentials.

## Acceptance criteria

- **AC-095-01:** The engine distinguishes the model-free deterministic catalog runtime from the reusable SDD delivery engine and retries only conservatively classified provider/Harness 429 or known RATE_LIMIT failures with a known delay signal; arbitrary failures and persistent quota failures stop without retry.
- **AC-095-02:** Retry timing is bounded and configurable with attempt limits, provider-delay precedence, exponential backoff, maximum delay, injected clock/jitter, visible countdown/status, and prompt cancellation; deterministic tests cover parsing and boundary behavior.
- **AC-095-03:** Every retry preserves project/change/spec scope and partial working tree, keeps the single-run lock, starts a new Harness session/attempt with explicit resume context and separate logs, and records cancellation, success, exhaustion, and non-retryable outcomes with a stable nonzero terminal exit when appropriate.
- **AC-095-04:** Every attempt is reserved and settled; failed-attempt provider usage is billable, unknown usage remains unreconciled/reserved rather than zero, and cumulative run/change budgets gate every subsequent provider call and fallback.
- **AC-095-05:** Only an explicit operator-approved Terra-to-economy-Luna fallback is allowed; it is visible and costed, preserves scope, and never silently escalates to Sol or bypasses authorization.
- **AC-095-06:** Final result and ledger metadata enumerate attempts, reasons, routes/models, delays, usage/accounting status, budget decisions, session/log references, authorization, and terminal outcome; exhaustion emits resumable state and an actionable nonzero message without promising provider availability.
- **AC-095-07:** Offline deterministic tests cover delay/backoff, retry success/exhaustion, non-retryable errors, cancellation, fallback authorization, cumulative budgets, failed-attempt billing, unknown usage, lock/scope/log preservation, and final metadata; `engine/README.md` and the Portuguese catalog tutorial document the boundary and operational recovery command.

## Proof

Run the focused rate-limit resilience test file(s), `npm test`, `npm run sdd:validate`, `npm run dsh:config`, and `npm run check`. Review synthetic result/ledger fixtures to confirm every attempt is represented and no provider or credential is contacted.

## Cost checkpoint

Classification, backoff, tests, validation, and documentation are model-free. A live retry attempt is subject to the existing immutable price book, per-attempt reservation, measured run cap, measured change cap, and honest unreconciled accounting from `SDD-091`.
