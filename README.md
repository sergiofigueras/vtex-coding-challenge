# VTEX Catalog Consolidation — SDD Agent Infrastructure

This repository is the delivery infrastructure and specification package for the catalog consolidation exercise. It intentionally does **not** contain the catalog application yet.

DeepSeek Harness orchestrates the engineering agent; OpenAI supplies every model call. The workflow turns a selected, dependency-ordered subset of the product specs into a bounded headless implementation run, verifies the result, and maps provider cost back to the change.

## What is ready

- Nine product specs (`SDD-000`–`SDD-008`) covering the boundary, input, SQLite migration, deterministic identity, consolidation, security, tests, and delivery.
- Three verified infrastructure specs (`SDD-090`–`SDD-092`) covering Harness, OpenAI cost control, traceability, and release gates.
- Pinned public fixture URLs, byte sizes, and SHA-256 hashes; downloads stay private under `.sdd/`.
- DeepSeek Harness `0.1.2-rc.1`, an isolated headless runner, a project-local SDD skill, and an offline configuration smoke test.
- OpenAI-only routing: Terra is the default, Luna is the economy model, and Sol is escalation-only.
- Pre-call and live budget gates, provider-usage extraction, integer price arithmetic, and an append-only hash-chained per-change ledger.

## Prerequisites

- Node.js `^22.19.0 || >=24.0.0`
- npm
- Python 3 with the standard `sqlite3` module (source inventory only)
- Git
- `OPENAI_API_KEY` only for a live agent run

## Bootstrap and verify

```bash
npm ci
npm run dsh:config
npm run sources:ingest
npm run check
npm run cost:report
```

`sources:ingest` downloads the public JSON and SQLite snapshots, verifies their pinned hashes, profiles them deterministically, and stores them only under ignored `.sdd/inputs`. CI stays offline and does not need an API key.

## Run the SDD agent

Start with a preparation-only run. It produces an ignored prompt and manifest, calls no model, and shows the dependency closure:

```bash
npm run sdd:prepare -- --change cli-input-implementation --spec SDD-001,SDD-002
```

After reviewing the selected specs, make `OPENAI_API_KEY` available in the shell without saving it in the repository, then run the same bounded task:

```bash
npm run sdd:run -- --change cli-input-implementation --spec SDD-001,SDD-002
```

Use `--route economy` for a deliberately low-cost mechanical change. The escalation route is intentionally noisy and requires both `--route escalation`, `--approve-escalation`, and `--escalation-reason "..."`.

The inner agent may edit and test the working tree. It may not commit, push, or read raw PDFs. The outer runner validates scope, isolates Harness state, monitors durable usage, writes an ignored run result, and appends a public cost record. Review its changes and proof before committing:

```bash
npm run check
npm run cost:report
git commit -m "Implement CLI and input contracts" -m "Cost-Entry: cli-input-implementation"
```

If the work was performed outside this Harness and its exact provider usage is unavailable, record that honestly rather than inventing zero:

```bash
npm run cost:record -- --change manual-review --spec SDD-001 --reason "External tool did not expose provider usage."
```

## Recommended implementation order

| Change | Specs to request | Outcome |
|---|---|---|
| 1 | `SDD-001,SDD-002` | TypeScript boundary, CLI contract, safe parsing |
| 2 | `SDD-003` | SQLite migrations and constraints |
| 3 | `SDD-004` | Deterministic canonical identity and alias data |
| 4 | `SDD-005,SDD-006` | Atomic consolidation, errors, security, observability |
| 5 | `SDD-007` | Complete automated and fixture verification |
| 6 | `SDD-008` | Public delivery and engineering defense |

These spec IDs are the prompts: the runner builds a compact instruction from the manifest and dependency graph, while the full behavior stays versioned in `docs/sdd/specs/`. Do not ask the agent to “build everything” in one context window.

## Model and cost policy

The default route is `openai/gpt-5.6-terra` at medium reasoning. Use `gpt-5.6-luna` for high-volume ingestion summaries, formatting, and mechanical test repair. `gpt-5.6-sol`, a request above 272,000 prompt tokens, or an unpriced model/tier requires an explicit policy change and review.

Pricing comes from the dated repository price book, not from a transitive adapter. Provider usage is normalized into disjoint uncached-input, cache-read, cache-write, and output buckets. Reasoning is included in output and is never counted twice. Since the pinned Harness adapter does not preserve the actual OpenAI service tier, known costs are marked `standard-assumed`; missing usage remains `unreconciled`, never zero.

The initial infrastructure change was authored in Codex outside the target Harness, whose exact token/currency usage was not exposed to this repository. Its ledger entry is therefore intentionally `unavailable`.

## Specification map

The canonical graph is `docs/sdd/manifest.json`; requirement authority and ownership are in `docs/sdd/traceability.json`. Start at `SDD-000`, which explicitly separates the user's workflow request, the assessment behavior, and fixture observations. Architectural choices are recorded in `docs/adr/`.

The source documents include a confidentiality notice. They are neither copied nor quoted in this public repository. Only paraphrased requirements, public URLs, hashes, and independently observed schema facts are retained.

## Release gate

A future product release requires:

1. all requested specs implemented and evidence-linked;
2. `npm run check` and the opt-in private-fixture suite passing from a clean clone;
3. source hashes and foreign-key invariants verified;
4. no PDFs, fixture bytes, databases, secrets, or Harness transcripts tracked;
5. a valid cost entry for every commit and `npm run cost:report` reviewed;
6. the final Git revision and CI result recorded in the delivery note.

See `docs/sdd/specs/08-delivery-and-engineering-defense.md` for the finished application runbook requirements; they are deliberately not fabricated before the application exists.
