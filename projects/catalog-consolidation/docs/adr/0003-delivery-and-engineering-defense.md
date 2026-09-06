# ADR 0003: Defend delivery with deterministic evidence

Status: accepted — 2026-09-06

## Context

The requested delivery is time-bounded and must be reviewable without confidential assessment files, generated agent transcripts, credentials, or model access. AI-assisted implementation can accelerate drafting, but generated output is not evidence by itself.

## Decision

Keep the catalog runtime deterministic and model-free. Treat the pinned public source manifest, executable tests, static SQL/security inspection, traceability validation, and a clean-room command sequence as the evidence authorities. Keep fixture inputs and Harness state under ignored `.sdd/` storage. Record decisions and limitations in public ADRs and README prose; report local cost metadata only as a bounded engineering-accounting artifact, never as provider billing.

The release gate is `npm ci`, `npm test`, `npm run sdd:validate`, and `npm run check`, with `npm run test:fixture` as an opt-in hash-verified private-input check. A reviewer may inspect tracked paths, run a secret scan, and reproduce a disposable-database run without credentials.

## Alternatives rejected

- **Trust model-generated code or prose without tests:** rejected because plausible output does not establish correctness, security, or fixture behavior.
- **Commit downloaded fixtures or assessment PDFs:** rejected because they are confidential/local artifacts and make clean-room review misleading.
- **Claim production scale or exact global identity:** rejected because the fixture and conservative canonical key provide narrower evidence.
- **Add telemetry or a provider SDK:** rejected because it increases runtime surface and would turn local cost observations into an unsupported billing claim.

## Consequences and limits

The repository is explainable and offline after dependency installation, while fixture acceptance remains opt-in and requires the documented source download. SQLite write contention is bounded by the application policy rather than solved as a scale-out system. Alias review and identity ambiguity remain deliberate human decisions. The final revision is reported by the delivery operator rather than embedded as mutable prose.
