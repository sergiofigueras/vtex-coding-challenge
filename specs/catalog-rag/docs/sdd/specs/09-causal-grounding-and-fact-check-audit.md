# Causal grounding and fact-check audit

Spec ID: `SDD-009`
Status: `ready`
Kind: product specification
Depends on: `SDD-003`, `SDD-004`, `SDD-005`

## Authority and scope

The user requires reproducible evidence that catalog answers use retrieved facts. `SDD-004` checks citation membership and output shape; a valid citation alone does not establish that an answer's factual claims are supported. This specification adds a production fact guard and an independent causal audit. It does not change catalog consolidation, product identity, or the read-only source boundary.

## Production fact guard

The answer provider may select facts, but it must return bounded, typed claims rather than unrestricted factual prose. Each claim names one supplied citation ID and `Product.Id`, a supported field, and its proposed value. The initial allowlist is `Product.Id`, name, brand, category, seller name, and seller-product ID, including the product-to-seller relationship. Compare values with current rehydrated evidence using documented exact Unicode normalization; never accept a claim merely because its words appear somewhere in an answer or because its citation ID exists. Reject unknown fields, unmatched values, a seller paired with the wrong product, duplicate/conflicting claims, claims about a non-cited product, and unsupported negative or comparative claims.

Construct the user-facing answer from verified claims with deterministic Portuguese/English templates. Keep the existing API answer, status, and citation envelope; the browser receives no raw claims or provider payload. A legacy provider response containing free-form text and citation IDs without verifiable claims must fail closed. A failed fact check returns `answer_unavailable` with usable retrieved results; empty or genuinely insufficient evidence returns `insufficient_evidence`. Requests for price, stock, descriptions, compatibility, ratings, or other absent source fields cannot produce a factual answer. No second unbounded model call may repair a rejected answer.

The same guard applies to the real answer adapter and offline fakes. Provider JSON schema, service validation, deterministic fake, API contract, and existing regression tests must be updated together. Preserve limits on evidence, claims, citations, output, deadline, and cancellation. The fake must consume the supplied evidence rather than a fixture answer hidden in its implementation.

## Independent factual oracle

Version synthetic catalog fixtures and expected facts separately from retrieval results and provider output. The oracle reads the authoritative fixture rows directly, including nullable fields and seller relationships; it must not derive expected answers from the evidence under test. Include Portuguese and English questions, exact ID and natural-language queries, multiple sellers, misleading decoys, missing fields, no results, ambiguous questions, and injection-shaped catalog text. An assertion is scored only when its expected product, field, value, and answer state are explicit. The question and provider prompt never contain the expected answer or the generated canary value.

For each response, check every factual claim against the oracle and its cited product, and require citations for every factual product assertion. A citation is valid only when it points to a returned, current product that supports the associated claim. Citation membership, factual support, question relevance, and correct abstention are separate results; no single aggregate score may hide a failure. A general-purpose LLM judge is not an acceptance oracle.

## Causal intervention

For the same question, run isolated end-to-end trials through the production retrieval and answer path against four disposable worlds:

1. **Original:** one product carries a run-generated canary value in a supported field.
2. **Relevant change:** the same product and ID carry a different canary value; rebuild the sidecar from that world's catalog.
3. **Evidence ablation:** the target product is absent or retrieval yields no target evidence.
4. **Irrelevant change:** only an unrelated product changes.

The answer must track the relevant value and citation in both positive worlds, abstain or omit the target claim after ablation, and remain factually stable under the irrelevant change. Each world uses a separate source and sidecar, and the source-file hash must remain unchanged during its trial. The audit records the fixture seed and hashes for replay without exposing catalog rows or answers in public evidence. Include a semantic-only natural-language case whose lexical/exact channels do not find the target, with a spy proving the configured query embedding path was called; also include an exact-ID case that correctly skips embeddings. Channel attribution is reported separately from answer grounding.

Run a deliberately evidence-ignoring provider and a provider that invents a plausible price while citing a real product. Both must make the audit fail. Reordered citations, stale source hashes, a product with the right value under the wrong citation, and a copied answer that does not respond to the relevant change must also fail. A deterministic fake passing the audit proves the offline pipeline and guard, not the behavior of an untested live model.

## Metrics and release decision

Produce a versioned machine-readable report with case ID, seed/hash identifiers, channel, expected/observed state, exact product match, factual claim support, citation precision and coverage, relevant-change sensitivity, ablation correctness, irrelevant-change stability, and stable failure codes. Define denominators and mark non-applicable metrics explicitly. The offline gate requires 100% factual support, citation precision/coverage, expected-state correctness, relevant-change sensitivity, ablation correctness, and negative-control stability on eligible cases; every adversarial case must be rejected. A case with no eligible assertion is not counted as a pass.

Add the deterministic audit command to the project `check` gate and `SDD-008` release evidence. It must run without credentials or external network, twice with identical seed and byte-identical normalized results, and leave the source catalog unchanged. Private per-case details stay under ignored `.sdd/`; the public evidence index may contain only commands, counts, hashes, thresholds, and redacted summaries.

An opt-in real-provider smoke may run the same intervention protocol with explicit configuration and a separately labeled report. Its observed metrics, model identity, and runtime usage are recorded apart from the offline gate and SDD delivery ledger. The repository must never claim that the live provider used RAG based only on fake-provider tests, valid-looking citations, or a successful HTTP request.

## Acceptance criteria

- **AC-009-01:** The production answer path accepts only typed, bounded, source-verifiable claims; it renders factual text from validated claims, preserves the public API envelope, and fails closed on unsupported, invented, mismatched, or legacy free-form claims.
- **AC-009-02:** A versioned bilingual fixture set and independent source-row oracle check exact product/field/value support, product-to-seller relationships, citation-to-claim support, question relevance, missing fields, and correct answer or abstention state without an LLM judge.
- **AC-009-03:** Isolated original, relevant-change, ablated, and irrelevant-change worlds demonstrate causal sensitivity and stability through the production API; semantic-only retrieval proves an embedding call, while exact-ID retrieval correctly bypasses it.
- **AC-009-04:** Evidence-ignoring, invented-price, copied-answer, wrong-citation, stale-source, and conflicting-claim cases fail the audit and cannot return an unsupported `answered` response.
- **AC-009-05:** A versioned report defines denominators and enforces the stated 100% offline thresholds; the project check runs the offline audit twice reproducibly without network or credentials, preserves source bytes, and publishes only redacted evidence.
- **AC-009-06:** Optional real-provider results are labeled and costed separately; no offline pass is presented as proof of live-provider grounding, and SDD status advances only with reproducible evidence for all applicable criteria.

## Proof plan

Implement the claim guard and oracle in the `catalog-rag` project behind injectable ports. First run focused guard and oracle tests, then the four-world causal tests and adversarial controls, then the project and root checks plus SDD validation. Record exact commands, exit status, fixture/report hashes, and date in `docs/sdd/evidence-index.md`. Keep this spec `ready` until implementation exists and every acceptance criterion has evidence.

## Cost checkpoint

The offline audit uses injected deterministic providers and incurs no provider usage. Optional live calls must record actual runtime usage as available under ignored project state; unknown cost is `unavailable`, never zero, and is not appended to the engine delivery ledger.
