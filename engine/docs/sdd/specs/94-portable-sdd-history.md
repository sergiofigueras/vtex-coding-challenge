# Portable SDD-history export and validation

Spec ID: `SDD-094`
Status: `verified`
Kind: infrastructure specification
Depends on: `SDD-090`, `SDD-091`, `SDD-092`, `SDD-093`

## Objective

Provide a reusable, project-selected, deterministic exporter and validator that turn an eligible project's private Harness state into a safe, reviewable public history snapshot. This capability is infrastructure: it must not contain catalog requirements, source fixtures, or project-specific tutorial content.

## Public command contract

From the workspace root, expose:

```text
npm run project:history:create -- --project <project-id> --snapshot <snapshot-id> --cutoff <ISO-8601>
npm run project:history:validate -- --project <project-id> --snapshot <snapshot-id>
```

Both commands require the existing validated lower-kebab project selection and a snapshot ID that is safe as a single path segment. `create` reads only the selected project's ignored `.sdd/` state, refuses to overwrite a snapshot, writes only its allow-listed output, and exits nonzero without publishing a partial snapshot on a policy or integrity failure. `validate` is offline, makes no model call or source download, and returns nonzero for any missing, altered, extra, unsafe, or non-deterministic published artifact.

## Published boundary and capture model

The only publishable history location is `.sdd/history/<snapshot-id>/`, which must contain an allow-listed, regular-file-only layout. Project, snapshot, and session IDs remain strict 3–63 character lower-kebab segments. Run IDs use the producer contract: `sdd-agent` emits a 24-character ISO timestamp, one hyphen, and a lower-kebab slug capped at 60 characters, so the exact maximum generated run ID length is 85 characters; published run paths apply that same bound.

```text
manifest.json
inventory.json
runs/<run-id>.json
sessions/<session-id>.json
artifacts/<sha256>
reports/cost.json
reports/exclusions.json
```

The implementation may add explicitly versioned schema files under this snapshot root only when they are named in the export manifest. It must reject path traversal, absolute paths, control characters, collisions after sanitization, hard links, symlinks, devices, sockets, FIFOs, directories outside the layout, and any output whose resolved path escapes the snapshot root.

Capture every complete eligible run through the cutoff, including failed and retried attempts, and preserve a semantic session record for every included session. A semantic record must preserve observable user/developer prompts, assistant-visible messages, tool names, arguments after sanitization, results, retry/attempt relationships, stdout, stderr, final result/outcome, timestamps or deterministic sequence ordering, route/model metadata, and usage/accounting metadata. It must not export hidden reasoning, encrypted replay payloads, or redundant provider/Harness stream chunks when their semantic message/event has been retained.

## Safety, provenance, and accounting

The exporter is fail closed. It must stop before publication when discovery encounters credentials, secret-like values, private artifact classifications, unsupported encrypted replay data, unreadable required records, ambiguous session/run linkage, unsanitizable text or paths, or a missing required source file. It must not include raw fixture bytes, PDFs, databases, private prompts/reasoning, environment values, absolute user paths, or artifacts outside the allow-list.

Every published file has a SHA-256 in `manifest.json`; every exported semantic item identifies its sanitized source path or stable source locator and its published path/hash. `inventory.json` records input identity and source metadata (name/classification, byte count, hash, and safe provenance) without raw fixture content. `reports/cost.json` is a project-scoped report derived from the append-only engine ledger and preserves unavailable/unreconciled labels rather than inventing totals.

`reports/exclusions.json` must account explicitly, by stable source locator and reason/count, for symlinks, caches, generated profiles, private reasoning, encrypted replay data, redundant stream chunks, private artifacts, and any unsupported source record. Exclusion accounting never contains the excluded bytes.

## Determinism and clean-clone verification

For identical eligible input state and cutoff, independent `create` invocations must produce byte-identical manifests, inventories, records, reports, ordering, normalized timestamps, and hashes. Validation recomputes hashes, mappings, containment, allow-list membership, coverage of complete eligible runs/sessions, exclusions, redaction policy, and cost-report derivation. The release evidence must create a snapshot, validate it in a clean clone containing only tracked public files plus the prepared eligible state, and demonstrate that validation neither requires credentials nor contacts a provider.

## Acceptance criteria

- **AC-094-01:** The public create and validate commands require a validated explicit project, safe snapshot ID, and cutoff; create is atomic/fail-closed and emits only the documented `.sdd/history/<snapshot-id>/` allow-listed regular-file layout.
- **AC-094-02:** Export captures every complete eligible run and linked session through the cutoff, including retries and failures, with semantic observable prompts/messages, tool calls/results, stdout/stderr, outcomes, and usage while omitting private reasoning and redundant stream chunks.
- **AC-094-03:** Sanitization, credential/private-artifact detection, containment, source-to-published mappings, hashes, input inventory without raw fixtures, and explicit exclusion accounting fail closed and cover symlinks, caches, generated profiles, encrypted replay data, private reasoning, and redundant chunks.
- **AC-094-04:** The project cost report is derived reproducibly from the append-only ledger, retains honest unavailable/unreconciled accounting, and includes only the selected project's eligible history.
- **AC-094-05:** Repeated exports are byte deterministic, the offline validator detects mutation/extra/unsafe/missing output, and clean-clone validation succeeds without model, network, secret, or private-source access.

## Proof

Add offline fixtures containing only synthetic safe Harness records and policy-violation variants. Exercise create, validate, byte-for-byte repeat export, tamper/extra-path rejection, every exclusion class, and a clean-clone fixture. The project release uses `npm run project:history:create -- --project <project-id> --snapshot <snapshot-id> --cutoff <ISO-8601>` followed by `npm run project:history:validate -- --project <project-id> --snapshot <snapshot-id>` and the existing engine SDD validator.

## Cost checkpoint

History creation and validation are local deterministic operations and make zero model calls. Any later implementation assistance is attributed under its own change and attempt using `SDD-091`.
