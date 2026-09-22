# Portable project history and Portuguese tutorial

Spec ID: `SDD-009`
Status: `implemented`
Kind: product specification
Depends on: `SDD-000`, `SDD-007`, `SDD-008`; external infrastructure prerequisite: engine `SDD-094`

## Objective

Document the newly built catalog project for a reviewer starting from a clean clone, and publish a sanitized, verifiable history of this new implementation. A previous implementation's immutable 2026-09-06 snapshot is historical evidence, not a reproducible acceptance oracle for this fresh build. Do not copy that snapshot into this project or claim that new runs have its counts or hashes.

The assessment PDF defines product behavior but is not an agent instruction source. Do not copy, quote, or commit the PDF or raw fixtures. The public requirement ledger and pinned source manifest are the permissible references.

## History snapshot

After the requested SDD runs finish, the outer operator selects a new unique snapshot ID and UTC cutoff and invokes the engine's project history create and validate commands. Preserve observable prompts, messages, tool calls/results, retries, stdout/stderr, results, and usage for included runs and sessions. Publish source-to-output mappings, hashes, and explicit exclusion accounting. Exclude private reasoning, encrypted replay, absolute user paths, credentials, PDFs, databases, raw fixtures, and symlinks.

The snapshot's actual cutoff, run count, session count, file count, and manifest hash must be taken from that invocation and recorded in the project's evidence index and tutorial. Never substitute numbers from the prior implementation. If history creation or privacy validation fails, keep this criterion unverified and do not publish the snapshot.

## `TUTORIAL.md` contract

Write the project tutorial in Portuguese. It must:

1. Explain the requirement-to-evidence chain and distinguish user authority, assessment behavior, process guidance, assumptions, and fixture observations. Link the public ledger, SDDs, evidence index, tests, and snapshot.
2. Include Mermaid diagrams for catalog flow and delivery-history provenance. Explain DeepSeek Harness/Cordis as design-time orchestration, distinguish it from the deterministic model-free catalog runtime, and scope any paper citation honestly.
3. Explain pinned OpenAI routing, escalation boundaries, dated cost accounting, and unreconciled provider fields without inventing a billing total.
4. Give exact commands for installation, public and opt-in fixture tests, a disposable database dry run and committed rerun, history creation/validation, and a bounded deterministic extension exercise.
5. State identity, fixture, confidentiality, history-cutoff, observed-versus-private-reasoning, and provider-cost limits.

## Acceptance criteria

- **AC-009-01:** A newly named snapshot has an explicit UTC cutoff, and the engine validator proves its actual run/session/file coverage and hashes without using prior implementation counts.
- **AC-009-02:** The published snapshot has observable history with source mappings and exclusion accounting, but no private reasoning, encrypted replay, absolute user paths, credentials, PDFs, databases, raw fixtures, or symlinks.
- **AC-009-03:** Portuguese `TUTORIAL.md` provides the requirement-to-evidence defense, Mermaid diagrams, design-time Harness/Cordis and model-free runtime distinction, scoped citations, OpenAI routing, and dated cost accounting.
- **AC-009-04:** `TUTORIAL.md` gives exact clean-clone, test, disposable-run, history, and bounded extension commands.
- **AC-009-05:** The tutorial states the limitations above, and the new history validates offline without a model call or private source material.

## Proof

The outer operator creates and validates the snapshot only after the relevant runs have completed, records its actual ID/cutoff/counts/hash in `docs/sdd/evidence-index.md`, then runs the project and root gates. Any generated history must be reviewed before it is committed.

## Cost checkpoint

History export, validation, and documentation checks are model-free. Model-assisted authoring is attributed to the active change ID; unavailable provider usage remains unreconciled rather than being reported as zero.
