# DeepSeek Harness SDD workflow with OpenAI models

Spec ID: `SDD-090`
Status: `verified`
Kind: infrastructure specification
Depends on: none

## Architecture

DeepSeek Harness is the orchestration runtime, not the model provider. Pin `@deepseek-ai/dsh` to `0.1.2-rc.1`, apply the small engine patch in `engine/config/dsh/automation.patch.yml`, and use the Harness `llm-pi-ai` adapter with the `openai` provider and `OPENAI_API_KEY`. Do not use the `openai-codex` route, a DeepSeek model, a moving model alias, or a vendored Harness fork.

The default agent route is exact model `gpt-5.6-terra` with medium reasoning. `gpt-5.6-luna` is the economy route for ingestion summaries, formatting, and mechanical repair. `gpt-5.6-sol` is an escalation-only route for hard architecture, security adjudication, repeated Terra failure, or final high-risk review. Sol use requires a recorded reason and budget approval. Keep the configured context window at 272,000 input tokens; longer context requires an explicit separately priced authorization.

## SDD lifecycle

Each run selects one validated `projects/<project-id>/` directory, one lower-kebab-case change ID, and one or more requested spec IDs. The runner:

1. Validates the repository and computes the dependency-ordered spec closure.
2. Builds a compact prompt containing paths and scope markers, not copied source documents.
3. Estimates and gates OpenAI cost before any provider call.
4. Starts one non-interactive, persisted Harness headless session with the selected project as its confined working directory and ignored state home.
5. Monitors durable Harness usage events and terminates at the measured run budget.
6. Records provider usage, touched paths, outcome, baseline revision, and unresolved accounting in the append-only ledger.

The repository skill tells the agent to inspect dependencies as context, implement only requested specs, run narrow tests, then run the full gate. The inner agent may edit the workspace but may not commit, push, access secrets, or broaden scope. The outer human/operator reviews, records the cost entry, commits with a matching trailer, and pushes.

## Source ingestion

`npm run project:sources -- --project <id>` downloads that project's declared public fixtures, verifies pinned SHA-256 and byte counts, and writes a private inventory under the project's `.sdd/inputs`. This is deterministic and makes no model call. Confidential source documents are never ingested by Harness or committed; only project-authorized specifications and normalized source metadata are supplied.

## Compatibility posture

Harness is developer-preview software. Keep the version exact, keep the engine profile patch minimal, and make `npm run dsh:config` an offline/keyless compatibility smoke test. An upgrade is a dedicated change with changelog review, config dump comparison, session-usage fixture tests, and a cost-ledger entry.

## Acceptance criteria

- **AC-090-01:** The repository pins DeepSeek Harness `0.1.2-rc.1` and an npm lockfile, and its configuration dump succeeds without calling a model.
- **AC-090-02:** Harness routes only through provider `openai` to exact allow-listed Luna, Terra, or Sol IDs; Terra medium is the default and Sol is escalation-gated.
- **AC-090-03:** A prepared run selects one project, resolves its spec dependencies, identifies implementation versus context-only specs, has one change ID, and contains no raw confidential document or fixture content.
- **AC-090-04:** Live headless runs use the selected project as their working and sandbox root, isolate runtime files, deny interactive approval, do not commit or push, monitor usage, and fail closed when usage cannot be reconciled.
- **AC-090-05:** Project source ingestion verifies every declared fixture hash and produces an ignored inventory without a model call.

## Proof

Run `npm ci`, `npm run dsh:config`, `npm run project:validate -- --project <id>`, `npm run project:sources -- --project <id>`, `npm run project:prepare -- --project <id> --change example-change --spec <SDD-ID>`, and `npm run check`. A live call is deliberately not required for infrastructure verification.

## Cost checkpoint

The compatibility smoke and source ingestion cost USD 0. A live run must pass `SDD-091` before the first model request.
