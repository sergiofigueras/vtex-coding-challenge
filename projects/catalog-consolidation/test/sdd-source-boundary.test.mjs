import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sourceBrief = readFileSync(
  new URL('../docs/sdd/specs/00-source-brief-and-requirement-ledger.md', import.meta.url),
  'utf8',
);
const traceability = JSON.parse(
  readFileSync(new URL('../docs/sdd/traceability.json', import.meta.url), 'utf8'),
);

test('AC-000-01: every ledger requirement has an authority and owner', () => {
  assert.ok(traceability.requirements.length > 0);

  for (const requirement of traceability.requirements) {
    assert.match(requirement.authority, /^(user|assessment|process|fixture-observation)$/);
    assert.ok(Array.isArray(requirement.specIds) && requirement.specIds.length > 0);
  }
});

test('AC-000-02: Git tracks neither source PDFs nor raw fixtures', () => {
  const trackedPaths = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .split('\n')
    .filter(Boolean);

  assert.equal(trackedPaths.some((path) => path.toLowerCase().endsWith('.pdf')), false);
  assert.equal(
    trackedPaths.some((path) => /(?:^|\/)(?:ProductEntry\.json|catalog\.db)$/.test(path)),
    false,
  );
});

test('AC-000-03: authorities and fixture observations remain distinct', () => {
  assert.match(sourceBrief, /## Authority boundary/);
  assert.match(sourceBrief, /The user's request controls the engineering workflow/);
  assert.match(sourceBrief, /The assessment describes the catalog behavior/);
  assert.match(sourceBrief, /Fixture observations describe the supplied snapshots/);
  assert.match(sourceBrief, /## Assumptions requiring explicit decisions/);
  assert.ok(traceability.requirements.some(({ authority }) => authority === 'fixture-observation'));
  assert.ok(traceability.requirements.some(({ authority }) => authority === 'assessment'));
});
