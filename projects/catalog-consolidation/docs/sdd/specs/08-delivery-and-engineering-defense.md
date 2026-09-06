# Delivery and engineering defense

Spec ID: `SDD-008`
Status: `verified`
Kind: product specification
Depends on: `SDD-007`

## Delivery package

The finished public repository must contain the TypeScript source, npm lockfile, migrations, alias data, tests, SDD status updates, traceability evidence, architectural decision records, cost ledger/report, and an exact runbook. It must not contain the assessment PDFs, downloaded JSON, SQLite database, generated run transcripts, credentials, or local machine paths.

The README must state prerequisites and exact commands for install, source ingestion, build, lint/typecheck/test, fixture acceptance, dry run, real run against a disposable database copy, cost report, and clean-room reproduction. Record the tested Node and SQLite library versions.

## Engineering narrative

Document the decisions an interviewer should be able to challenge:

- why seller product IDs are opaque seller-scoped text;
- why canonical deterministic identity was chosen and where it deliberately stops;
- why migrations preserve source-facing product fields;
- why the batch is atomic and idempotent;
- what the fixture proves and does not prove;
- how AI output was bounded, tested, reviewed, and costed;
- failure modes, security properties, performance limits, and next improvements.

Keep assumptions visibly separate from sourced requirements. Do not imply production scale, exact global product identity, or fully reconciled provider billing without evidence.

## Acceptance criteria

- **AC-008-01:** A clean checkout can reproduce validation and tests using only documented commands and public source URLs.
- **AC-008-02:** The public tree contains all implementation evidence and none of the confidential PDFs, downloaded fixtures, databases, secrets, or generated agent transcripts.
- **AC-008-03:** ADRs and README explain identity, schema, transaction, security, AI-governance, cost, limitations, and rejected alternatives in interview-ready language.
- **AC-008-04:** All ready product specs become `implemented` or `verified`, every acceptance criterion has evidence, and the final Git revision is reported before delivery.

## Proof

Run the complete release gate from a clean clone, inspect tracked files and secret-scan output, generate the cost report, and verify all traceability links. The reviewer should be able to explain any generated line and perform a small live change safely.

## Cost checkpoint

Use Luna for formatting and routine documentation, Terra for final engineering review, and Sol only if a recorded high-risk issue cannot be adjudicated by Terra.
