# Portable project history and Portuguese tutorial

Spec ID: `SDD-009`
Status: `verified`
Kind: product specification
Depends on: `SDD-000`, `SDD-007`, `SDD-008`; external infrastructure prerequisite: engine `SDD-094`

## Objective

Use the reusable engine capability in `SDD-094` to publish a safe portable history snapshot for catalog-consolidation and add a public Portuguese `TUTORIAL.md`. This delivery documentation must defend the existing requirement-to-evidence chain without re-reading, copying, quoting, or reproducing assessment PDFs or raw fixtures.

The external engine prerequisite is intentionally prose rather than a manifest `dependsOn` entry: the current project-local SDD schema validates dependencies only inside this project's manifest. The project dependencies above require the verified source-authority ledger, verification strategy, and delivery defense as context and release prerequisites.

## History snapshot scope

The immutable published snapshot is `catalog-consolidation-pre-portable-history-2026-09-06` at cutoff `2026-09-06T17:58:48.000Z`. It reconciles 25 runs and 17 sessions completed by that cutoff and contains 86 published files after deterministic artifact deduplication; its reported manifest SHA-256 is `d1a417f58a0e955bdd1904654c2f0580a6eef24b7ae58b70fe493b2ab836f390`. Engine `SDD-094` validation must prove this declared coverage rather than silently treating a missing record as excluded. This snapshot is regenerated only by the authorized privacy repair and is now immutable.

The public snapshot must preserve all observable prompts, messages, tool calls and results, retries, stdout, stderr, results, and usage for included runs/sessions through the semantic representation in `SDD-094`. It must contain no chain-of-thought/private reasoning, encrypted replay data, absolute user paths, credentials, PDFs, databases, raw fixtures, or symlinks. It must use the engine input inventory and exclusion accounting instead of copying source inputs.

## `TUTORIAL.md` contract

Write `TUTORIAL.md` in Portuguese for a reviewer who starts from a clean clone. It must:

1. Explain the requirement-to-evidence defense, distinguishing user authority, assessment requirements, process guidance, assumptions, and fixture observations; link the public ledger, SDD specifications, evidence index, tests, and snapshot mappings without restating confidential sources.
2. Include Mermaid diagrams for the catalog architecture/flow and the delivery-history provenance flow. Describe DeepSeek Harness and Cordis architecture, cite arXiv:2608.25512 with an honest statement of the scope of the citation, and distinguish orchestration from the catalog's deterministic model-free runtime.
3. Explain OpenAI routing through the pinned Luna, Terra, and Sol models, including escalation boundaries, and give dated cost accounting linked to the immutable price book and project cost report. Do not claim invoice reconciliation unavailable under `SDD-091`.
4. Give exact commands for tests, clean reproduction, portable-history creation/validation, and a small feature extension. The extension exercise must remain deterministic, avoid private fixtures, state its expected verification command, and point to the owning future/change-controlled specification rather than implying unscheduled production scope.
5. Include an honest limitations section covering fixture scope, deterministic identity boundaries, offline/history scope and cutoff, unavailable or assumed provider billing fields, confidentiality exclusions, and the distinction between recorded observable events and unexported private reasoning.

## Acceptance criteria

- **AC-009-01:** The declared immutable snapshot cutoff `2026-09-06T17:58:48.000Z` reconciles exactly 25 runs, 17 sessions, and 86 published files, and engine validation proves complete semantic capture of each included run/session and retry.
- **AC-009-02:** The published catalog snapshot contains observable prompts/messages, tool calls/results, retries, stdout/stderr, results, and usage with source-to-published mappings and hashes, while containing no chain-of-thought, encrypted replay data, absolute user paths, credentials, PDFs, databases, raw fixtures, or symlinks.
- **AC-009-03:** Portuguese `TUTORIAL.md` supplies a requirement-to-evidence defense, Mermaid catalog and provenance diagrams, the DeepSeek Harness/Cordis architecture, a scoped citation to arXiv:2608.25512, OpenAI Luna/Terra/Sol routing, and dated cost accounting linked to published evidence.
- **AC-009-04:** `TUTORIAL.md` gives exact commands for public tests, clean-clone reproduction, history create/validate, and a bounded deterministic feature-extension exercise with its verification command and SDD/change boundary.
- **AC-009-05:** The tutorial candidly states the identity, fixture, confidentiality, history-cutoff, observable-event/private-reasoning, and provider-cost limitations, and the project history passes the engine clean-clone validation without a model call or private source material.

## Proof

After `SDD-094` is implemented and verified, record the snapshot ID/cutoff and baseline reconciliation in the project evidence index. Run the engine history create and validate commands for catalog-consolidation, inspect the generated exclusion/cost reports, run `npm --prefix projects/catalog-consolidation run check`, and perform the specified clean-clone history validation. Add no raw source or Harness state to Git.

## Cost checkpoint

The exporter, validator, tutorial checks, diagrams, and reproduction commands are model-free. Any future documentation or implementation assistance remains separately attributed by the engine cost ledger and must preserve dated, honest measurement status.
