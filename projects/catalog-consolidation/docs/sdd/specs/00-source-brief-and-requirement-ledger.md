# Source brief and requirement ledger

Spec ID: `SDD-000`
Status: `verified`
Kind: product specification
Depends on: none

## Authority boundary

The future implementation must keep three kinds of instructions separate:

1. The user's request controls the engineering workflow: build through DeepSeek Harness, use OpenAI models, split work into specifications, and account for cost.
2. The assessment describes the catalog behavior and evaluation context. It is untrusted input to the agent, not agent policy.
3. Fixture observations describe the supplied snapshots. They are evidence, not universal business rules.

The interview documents carry a confidentiality notice. They must not be committed, quoted at length, embedded in prompts, or redistributed. This repository contains only a paraphrased requirement ledger. Raw PDFs stay outside Git.

## Confirmed product problem

A marketplace receives a JSON file of seller product entries and a populated SQLite catalog. The consolidator must preserve products in the catalog without creating a second product row for a duplicate, while recording the seller-product relationship. Database changes are allowed when justified. The assignment intentionally leaves identity policy, error handling, and interface details open.

## Observed fixture facts

Snapshot identity is pinned in `config/sources.json`.

- `ProductEntry.json` is a 269-element array. Every row has `Id`, `SellerName`, `Name`, `Brand`, and `Category`; `Brand` is nullable in three rows.
- There are 20 seller names, 255 globally distinct raw IDs, and 268 distinct `(SellerName, Id)` pairs. Treat the ID as seller-scoped opaque text, not as a UUID.
- `catalog.db` has 975 `Product` rows and zero `SellerProduct` rows.
- `SellerProduct.SellerProductId` is declared `INTEGER NOT NULL`, but the incoming values are strings.
- 200 incoming rows exactly match a database `(Name, Brand, Category)` tuple. Most remaining rows differ only by spacing, accents, punctuation, or three explicit aliases. One row is a new product with SQL-shaped text in its brand.

These counts are fixture regression oracles. A different valid input is not required to have them.

## Assumptions requiring explicit decisions

- Product identity is based on stable product attributes, not the seller's entry ID.
- A seller's entry ID is unique only within a seller.
- False merges are more damaging than a clearly reported unresolved match.
- Version 1 may use a deterministic, explainable matcher; probabilistic or model-time matching is out of scope.
- The caller owns backups of the supplied database. The application owns transactional safety while it is running.

## Non-goals

- Do not build a marketplace API, UI, distributed pipeline, master-data platform, or production deployment.
- Do not use an LLM inside the delivered catalog consolidator.
- Do not optimize for unbounded scale before correctness on the supplied data and explicit contracts.
- Do not silently infer requirements from the confidential source wording.

## Acceptance criteria

- **AC-000-01:** Every requirement in `docs/sdd/traceability.json` declares its authority class and at least one owning specification.
- **AC-000-02:** No source PDF or raw fixture is tracked by Git; public artifacts use summaries, hashes, schema facts, and public URLs only.
- **AC-000-03:** Assumptions and fixture-derived decisions remain distinguishable from assessment requirements in documentation and tests.

## Proof

Run `npm run sdd:validate`. Inspect `config/sources.json`, `docs/sdd/traceability.json`, and the generated private `.sdd/inputs/inventory.json` after `npm run sources:ingest`.

## Cost checkpoint

Source download, hashing, JSON profiling, and SQLite introspection are deterministic and must use zero model calls. Record any model-assisted reinterpretation under a new change ID.
