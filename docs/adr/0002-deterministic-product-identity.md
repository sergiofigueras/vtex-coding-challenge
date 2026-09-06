# ADR 0002: Use deterministic, conservative product identity

Status: proposed for `SDD-004` — 2026-09-06

## Decision

Resolve identity from a versioned canonical `(Name, Brand, Category)` fingerprint and a small reviewed field-specific alias table. Abort on collisions. Do not use fuzzy thresholds, embeddings, or runtime LLM calls.

## Consequences

Matches are reproducible and explainable, and false merges are constrained. Some true duplicates may remain separate until a reviewed alias or manual-resolution design is added.
