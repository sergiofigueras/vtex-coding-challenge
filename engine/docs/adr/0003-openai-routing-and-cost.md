# ADR 0003: Route OpenAI models through DeepSeek Harness

Status: accepted — 2026-09-06

## Decision

Use DeepSeek Harness for orchestration and provider `openai` for model execution. Default to exact model `gpt-5.6-terra`, use `gpt-5.6-luna` for mechanical work, and gate `gpt-5.6-sol`. Price provider-reported disjoint usage with an immutable repository-owned OpenAI price book and integer nanodollars.

## Consequences

Model choice and spend are explicit per change. Adapter price drift cannot silently rewrite history. Until actual response service tier is persisted, currency values remain Standard/default-assumed rather than invoice-reconciled.
