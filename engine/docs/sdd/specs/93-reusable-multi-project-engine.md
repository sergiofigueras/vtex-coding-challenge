# Reusable multi-project engine boundary

Spec ID: `SDD-093`
Status: `verified`
Kind: infrastructure specification
Depends on: `SDD-090`, `SDD-091`, `SDD-092`

## Goal

Keep the complete DeepSeek Harness delivery engine under `engine/` and treat every deliverable as data and code under `projects/<project-id>/`. Adding a project must not require copying the runner, model configuration, pricing, budget logic, validator, tests, or delivery skill.

## Project contract

Every project has a lower-kebab-case directory and `project.json`. The descriptor names its SDD manifest, reciprocal traceability ledger, source manifest, and ignored state directory. All declared paths are relative and contained by the project root. The engine resolves projects only beneath the workspace `projects/` directory and rejects missing, mismatched, symlink-escaped, or malformed descriptors.

Project-scoped commands require `--project <id>`. The root package retains catalog-specific convenience commands, while `project:create`, `project:validate`, `project:prepare`, `project:run`, `project:sources`, and `project:cost` expose the reusable surface. A generated project begins with a valid empty SDD graph and source list, local instructions, a package check command, and no model call.

## Runtime isolation

The engine starts Harness with the selected project as its working directory, puts prompts, sessions, locks, and results in that project's ignored state directory, and exposes the engine-owned delivery skill through the Harness bundled-skill directory. The filesystem sandbox is therefore scoped to the selected project rather than the engine or repository root.

Configuration, price books, tests, and the append-only cost ledger remain engine-owned. Every new cost event carries `projectId`; reports can show all projects or filter one. Historical entries created before project separation remain valid and are not rewritten.

## Acceptance criteria

- **AC-093-01:** Generic engine implementation, Harness configuration, skills, tests, infrastructure specs, pricing, and the cost ledger live under `engine/`; catalog-only material lives under `projects/catalog-consolidation/`.
- **AC-093-02:** A validated `project.json` selects all project-relative manifests and state, and path or symlink escape attempts fail closed.
- **AC-093-03:** Prepare, run, ingestion, validation, cost recording, and cost reporting accept an explicit project ID; live Harness execution uses the selected project as its working and sandbox root.
- **AC-093-04:** A model-free project-creation command scaffolds another valid project without copying engine internals, and tests prove selection and scaffold behavior.
- **AC-093-05:** Existing catalog convenience commands, offline configuration checks, SDD validation, engine tests, cost-chain validation, and CI continue to pass after migration.

## Proof

Run `npm ci`, `npm run dsh:config`, `npm run project:validate -- --project catalog-consolidation`, `npm test`, and `npm run check`. Unit tests create and validate an isolated project fixture without changing the repository.

## Cost checkpoint

Project selection, scaffolding, validation, tests, and source profiling are deterministic and model-free. Model calls remain subject to the existing OpenAI reservation and settlement policy.
