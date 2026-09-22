# Product identity and deterministic resolution

Spec ID: `SDD-004`
Status: `ready`
Kind: product specification
Depends on: `SDD-002`, `SDD-003`

## Decision

Version 1 uses an explainable canonical key rather than fuzzy or LLM-based matching. A product is the same product when canonical `(Name, Brand, Category)` fields are identical. Multiple existing rows with the key are an ambiguity and stop the batch. A row with no exact key is inserted only after the conservative potential-duplicate screen below finds no candidate.

Canonicalization is a pure, versioned function:

1. Convert null brand to an empty component.
2. Unicode-normalize and remove combining marks for comparison only.
3. Case-fold.
4. Remove apostrophes and quotation marks without adding token boundaries.
5. Replace other punctuation with spaces and collapse whitespace.
6. Apply only field-specific aliases from a checked-in data file.

The initial alias file must include the fixture-supported equivalences `roteador -> router`, `processador -> processor`, and category `photo -> photography`. Apply an alias to a complete normalized token or phrase **anywhere within its field**, not only when the entire field equals the alias. For example, `Roteador Modelo X` and `Router Modelo X` must have the same canonical name, while `Microprocessador Modelo X` must not become `Microprocessor Modelo X`. Match the longest reviewed phrase first when aliases overlap. Never replace a substring inside a word. Additions require an ADR and collision tests.

## Potential-duplicate screen

After the exact-key lookup and before any new `Product` insert, compare the canonical components with existing catalog products and products planned earlier in the same batch. If canonical `Name` is identical and **either** canonical `Brand` or canonical `Category` is identical, but the full triple is not identical, classify the row as `ambiguous` with reason `potential_duplicate`. This includes a missing-versus-present brand with the same name and category, and a category conflict with the same name and brand. Candidate IDs and rules are bounded by the diagnostics limit; never expose unbounded product data.

Do not guess whether these candidates are identical, merge them, link a seller, or insert a new `Product`. Abort and roll back the whole batch under the existing identity-ambiguity exit code. A human can correct the source data or add a reviewed, versioned alias only after checking that it does not collapse distinct models. A genuinely distinct name/model with no exact or potential candidate remains `new`; for example, `Model X` and `Model X Pro` must not be merged merely because their tokens overlap.

## Match evidence

Every resolution returns one of:

- `matched`: existing product ID, canonical key, normalization version, and rules used.
- `new`: canonical key and normalization version, after the potential-duplicate screen is clear.
- `ambiguous`: bounded candidate product IDs and either `fingerprint_collision` or `potential_duplicate` as the collision reason.

Do not store model scores, edit distance, or unbounded candidate lists. Preserve the existing catalog row as canonical display data when matched; use the incoming original values only for a new product.

## Deliberate limits

No stemming, general translation, token similarity, embeddings, or probabilistic thresholds. The potential-duplicate screen reduces a defined class of false splits but cannot identify every semantic equivalent: a differently named product with no reviewed alias may still be inserted separately. The solution must disclose that limitation; it must not claim universal duplicate detection. If a new unseen semantic variant is important, add a reviewed alias or a future manual-resolution workflow rather than silently broadening the matcher.

## Acceptance criteria

- **AC-004-01:** Canonicalization is deterministic across processes, locales, and input order and is covered by golden tests.
- **AC-004-02:** Whitespace, accents, quote variants, safe punctuation, and the three declared aliases resolve the supplied variants to existing products, including aliases within multiword names. Tests must prove that a larger word containing an alias is not partially replaced. After seller-entry deduplication, the supplied fixture resolves 267 entries to existing products and leaves exactly one new product candidate.
- **AC-004-03:** The injection-shaped new product remains new, and its original display values are preserved without executing any embedded syntax.
- **AC-004-04:** Two catalog rows with one canonical fingerprint produce `ambiguous` and no mutation rather than an arbitrary match.
- **AC-004-05:** Alias changes are data-reviewed, versioned, collision-checked, and do not mutate historical display fields.
- **AC-004-06:** A no-exact-match row with the same canonical name and either the same brand or category as a catalog or in-batch product returns bounded `potential_duplicate` ambiguity, inserts no product, creates no seller link, and rolls back the batch; a distinct model name remains new rather than being falsely merged.

## Proof

Add pure normalization tests, alias-collision tests for whole names and aliases inside multiword names, product-resolution tests, potential-duplicate and distinct-model tests, and a fixture oracle that asserts the matched/new counts. Document why deterministic matching was selected over fuzzy and model-time alternatives and where false splits remain possible.

## Cost checkpoint

All production resolution is model-free. Any model used to propose aliases is design-time cost attached to the change that reviews those aliases.
