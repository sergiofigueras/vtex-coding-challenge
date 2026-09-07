# Public presentation artifacts and historical trailer correction

Spec ID: `SDD-096`
Status: `verified`
Kind: infrastructure specification
Depends on: `SDD-091`, `SDD-092`, `SDD-094`

## Objective

Restore CI after two reviewed, generated presentation PDFs and a README template were added through GitHub. Preserve the public presentations without weakening the repository's prohibition on confidential source PDFs, databases, private fixtures, raw Harness state, or unpriced/unattributed changes.

## Public artifact policy

Generated presentation PDFs may be tracked only when an engine-owned manifest allowlists their exact repository-relative path, byte length, artifact kind, and SHA-256 digest. The validator fails when an allowlisted artifact is absent, changed, duplicated, malformed, outside the repository, or not a PDF. Every other tracked PDF remains prohibited. The allowlist is not a directory or filename-pattern exception.

The root README links to the two reviewed decks so the binary artifacts have an explicit public purpose. The source assessment PDFs remain untracked and prohibited.

## Historical cost-trailer correction

The GitHub README commit contains `Cost-Entry: Template adding`, which is not a valid lower-kebab-case change ID and cannot be rewritten safely after publication. An engine-owned historical correction manifest may map only the exact immutable commit SHA and exact observed malformed value to a valid ledger change ID. The mapped change ID must exist in the append-only cost ledger. The validator continues rejecting every unlisted missing or malformed trailer and every unknown change ID.

The PDF-upload change, README-template change, and this CI repair each receive explicit append-only cost entries. Where exact provider usage is unavailable, the ledger records `unavailable` rather than zero.

## Acceptance criteria

- **AC-096-01:** CI accepts only the two reviewed public presentation PDFs by exact path, byte length, kind, and SHA-256, while continuing to reject any unlisted PDF and all private database/source/runtime artifacts.
- **AC-096-02:** The README links to both public decks, and `.gitignore` permits only those two exact generated PDF paths while retaining the general PDF prohibition.
- **AC-096-03:** The validator accepts the one immutable malformed historical README trailer only through an exact SHA/value/change-ID mapping backed by the append-only ledger; all future or unlisted malformed trailers remain invalid.
- **AC-096-04:** Offline tests cover manifest integrity, artifact tampering, an unlisted PDF, exact legacy correction, malformed future trailers, and unknown mapped change IDs.
- **AC-096-05:** The PDF upload, README template, and CI repair have honest append-only cost records, and root/project checks plus `git diff --check` pass before delivery.

## Proof

Run the focused public-artifact and trailer-policy tests, `npm run check`, `npm --prefix projects/catalog-consolidation run check`, and `git diff --check`. Push a valid `Cost-Entry: fix-ci-public-presentations` commit and monitor the GitHub Actions CI run through a successful conclusion.
