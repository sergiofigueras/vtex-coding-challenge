# ADR 0004: Pin the DeepSeek Harness preview

Status: accepted — 2026-09-06

## Decision

Pin the latest published npm release observed during setup, `@deepseek-ai/dsh@0.1.2-rc.1`. Keep the project patch small, test its resolved configuration offline, and upgrade only in a separately costed change.

## Consequences

The repository does not silently adopt preview breaking changes. New Harness capabilities require deliberate compatibility and usage-accounting verification.
