# SDD Delivery Engine

This directory is the reusable delivery engine. It owns DeepSeek Harness integration, OpenAI-only routing, spec orchestration, source ingestion, cost accounting, release validation, the delivery skill, and their tests. It contains no catalog-specific requirements or application code.

## Contract

```text
engine/                         reusable control plane
  config/                       Harness routes, budgets, immutable prices
  scripts/                      project creation, ingestion, execution, validation
  .dsh/skills/sdd-delivery/     model-facing delivery instructions
  docs/sdd/                     specifications for the engine itself
  cost/ledger.jsonl             append-only cross-project cost history
  test/                         offline engine tests

projects/<project-id>/          independently deliverable project
  project.json                  paths and identity consumed by the engine
  AGENTS.md                     project-local constraints
  config/sources.json           optional public evidence sources
  docs/sdd/                     product specs and reciprocal traceability
  .sdd/                         ignored prompts, inputs, sessions, and results
  package.json                  project/application checks
```

Every project-scoped engine command requires `--project <project-id>`. Project IDs are lower-kebab-case directories directly below `projects/`. Descriptor paths must be relative and remain inside that directory; real paths are checked so a project symlink cannot escape the workspace boundary.

## Generic commands

Run these from the repository root:

```bash
npm ci
npm run project:create -- --id example-service --title "Example Service"
npm run project:validate -- --project example-service
npm run project:sources -- --project example-service
npm run project:prepare -- --project example-service --change first-slice --spec SDD-001
npm run project:run -- --project example-service --change first-slice --spec SDD-001
npm run project:cost -- --project example-service
npm run project:history:create -- --project example-service --snapshot review-2026 --cutoff 2026-09-06T00:00:00Z
npm run project:history:validate -- --project example-service --snapshot review-2026
```

Project creation is model-free and refuses to overwrite an existing directory. It creates a valid empty manifest and traceability graph; write and register product specs before preparing a run.

`project:prepare` validates the engine and selected project, computes a dependency-ordered prompt, and writes it under the project's ignored `.sdd/` directory without calling a model. `project:run` performs the same preparation, reserves the OpenAI budget, starts pinned Harness with the project directory as its working/sandbox root, exposes the engine-owned skill, settles provider usage, and appends a project-attributed cost event.

### Bounded rate-limit recovery

The catalog application runtime is deterministic and model-free: it never calls OpenAI and this recovery feature does not alter it. Recovery applies only to an interrupted engine `project:run`. The default policy makes at most three total provider attempts, waits at most 60 seconds per recognized delayed `429`/`RATE_LIMIT`, preserves the existing tree and run lock, and writes per-attempt plus aggregate logs and `result.json` under `.sdd/runs/<run-id>/`. Authentication, quota, other HTTP failures, transport, validation, budget, reconciliation, and unknown failures are terminal.

Observe the run output and its result JSON; after capacity is available, invoke the same command again with the identical project/change/spec scope. An operator may reserve the final attempt for the only permitted fallback (Terra/default to economy/Luna) explicitly:

```bash
npm run project:run -- --project example-service --change first-slice --spec SDD-001 --route default --rate-limit-fallback economy
```

No fallback is automatic, it is rejected for economy or escalation routes, and rate-limit recovery never selects Sol. Exhaustion exits `75` with an actionable resume/capacity/fallback message; Ctrl-C exits `130` and terminates an active child with SIGTERM followed by the configured grace-period SIGKILL only if necessary. Provider availability is not promised. Usage is isolated by durable event identity per attempt, including appends to an existing session file.

## Engine verification

```bash
npm run dsh:config
npm run sdd:validate
npm test
npm run check
```

CI is offline: it resolves every OpenAI-only Harness route, validates the engine and all registered projects, verifies the global ledger chain and commit trailers, scans tracked files for secrets/private inputs, and runs the engine tests. Live model execution requires `OPENAI_API_KEY`; project creation, preparation, source profiling, validation, reporting, and CI do not.
