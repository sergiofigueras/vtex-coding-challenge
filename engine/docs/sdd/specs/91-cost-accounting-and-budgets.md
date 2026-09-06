# OpenAI cost accounting and budgets

Spec ID: `SDD-091`
Status: `verified`
Kind: infrastructure specification
Depends on: `SDD-090`

## Price authority

Use `engine/config/pricing.openai-2026-09-06.json`, an immutable OpenAI Standard/default-tier snapshot with official model URLs and a review deadline. Never use a transitive adapter's embedded dollar estimate. Add a successor price book rather than editing an already-used one.

The allow-list contains exact `gpt-5.6-luna`, `gpt-5.6-terra`, and `gpt-5.6-sol` IDs. Rates are integer USD nanodollars per token for disjoint uncached input, cache-read, cache-write, and output buckets. Prompt input above 272,000 tokens reprices the whole request at 2x input rates and 1.5x output; exactly 272,000 remains base tier. Reasoning tokens are a breakdown of output tokens and are never charged again.

## Accounting quality

Provider-reported usage from durable Harness events is the token source of truth. Count every attempt, including retries and failed attempts that report usage. The current Harness adapter does not persist the OpenAI response's actual service tier, so completed figures are labeled `provider-reported-standard-assumed`, not fully reconciled, even though the requested/project tier is Standard/default. Missing usage is `unreconciled` and retains its estimate; it is never recorded as zero.

Each append-only ledger entry includes project/change/spec IDs, route, disjoint usage, immutable price-book ID, estimate, actual known amount, accounting status, baseline, touched paths, outcome, reason, previous hash, and entry hash. External work with unavailable usage receives an explicit unavailable entry. `npm run project:cost -- --project <id>` filters rollups without rewriting history.

## Budget policy

Before a live run, reserve the conservative estimate in `engine/config/cost-policy.json`. Refuse the call when the estimated run exceeds its cap. During the run, sum per-attempt provider events and terminate at the measured cap. The measured run cap must not exceed the change cap. If an estimate may cross 272,000 input tokens, price the whole reservation at the long-context tier.

Luna is preferred for mechanical phases; Terra is the default implementation/review model. Sol, long context, provider/model aliases, non-OpenAI providers, and unpriced service tiers fail closed without explicit approved policy changes. Budget overrides are new ledgered changes, never environment-only bypasses.

## Acceptance criteria

- **AC-091-01:** Pricing uses an immutable, dated OpenAI price book with exact model IDs, official URLs, a review deadline, and integer nanodollar rates.
- **AC-091-02:** Golden tests price all four disjoint buckets, keep reasoning within output, and enforce the 272,000/272,001 long-context boundary.
- **AC-091-03:** Every Harness attempt is attributed to one project and change; missing usage stays unreconciled and unavailable external usage is never represented as zero.
- **AC-091-04:** Pre-call projected, live measured-run, and measured-change budgets fail closed; Sol and long context require explicit authorization.
- **AC-091-05:** Ledger records are append-only and hash-chained, and the report maps estimates, known actuals, and unavailable entries by change.

## Proof

Run `npm test`, `npm run sdd:validate`, and `npm run cost:report`. Review the price book before its deadline or before any provider pricing change, whichever comes first.

## Cost checkpoint

Cost accounting itself is local and model-free. Do not claim exact invoice reconciliation until actual OpenAI service-tier metadata or billing-export reconciliation is available.
