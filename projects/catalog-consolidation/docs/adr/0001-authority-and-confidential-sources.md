# ADR 0001: Separate authority and keep source documents private

Status: accepted — 2026-09-06

## Decision

Treat the user's workflow request as agent policy, the assessment as product requirements, process guidance as delivery expectations, and downloaded fixture facts as evidence. Store only paraphrases and public source metadata. Never commit or feed the confidential PDFs to the delivery agent.

## Consequences

The traceability ledger makes ambiguity visible and prevents document prose from overriding operator instructions. Reviewers can reproduce data observations from public hashed URLs without redistributing the source documents.
