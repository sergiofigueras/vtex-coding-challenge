# Product identity and deterministic resolution

Spec ID: `SDD-004`
Status: `ready`
Kind: product specification
Depends on: `SDD-002`, `SDD-003`

## Decision

Version 1 uses an explainable canonical key rather than fuzzy or LLM-based matching. A product is the same product when canonical `(Name, Brand, Category)` fields are identical. New rows are inserted when no canonical key exists. Multiple existing rows with the key are an ambiguity and stop the batch.

Canonicalization is a pure, versioned function:

1. Convert null brand to an empty component.
2. Unicode-normalize and remove combining marks for comparison only.
3. Case-fold.
4. Remove apostrophes and quotation marks without adding token boundaries.
5. Replace other punctuation with spaces and collapse whitespace.
6. Apply only field-specific aliases from a checked-in data file.

The initial alias file must include the fixture-supported equivalences `roteador -> router`, `processador -> processor`, and category `photo -> photography`. Aliases are exact normalized tokens or phrases, never substring replacements. Additions require an ADR and collision tests.

## Match evidence

Every resolution returns one of:

- `matched`: existing product ID, canonical key, normalization version, and rules used.
- `new`: canonical key and normalization version.
- `ambiguous`: candidate product IDs and the collision reason.

Do not store model scores, edit distance, or unbounded candidate lists. Preserve the existing catalog row as canonical display data when matched; use the incoming original values only for a new product.

## Deliberate limits

No stemming, general translation, token similarity, embeddings, or probabilistic thresholds. This trades false splits for protection against false merges. If a new unseen semantic variant is important, add a reviewed alias or a future manual-resolution workflow rather than silently broadening the matcher.

## Acceptance criteria

- **AC-004-01:** Canonicalization is deterministic across processes, locales, and input order and is covered by golden tests.
- **AC-004-02:** Whitespace, accents, quote variants, safe punctuation, and the three declared aliases resolve the supplied variants to existing products.
- **AC-004-03:** The injection-shaped new product remains new, and its original display values are preserved without executing any embedded syntax.
- **AC-004-04:** Two catalog rows with one canonical fingerprint produce `ambiguous` and no mutation rather than an arbitrary match.
- **AC-004-05:** Alias changes are data-reviewed, versioned, collision-checked, and do not mutate historical display fields.

## Proof

Add pure normalization tests, alias-collision tests, product-resolution tests, and a fixture oracle. Document why deterministic matching was selected over fuzzy and model-time alternatives.

## Cost checkpoint

All production resolution is model-free. Any model used to propose aliases is design-time cost attached to the change that reviews those aliases.
