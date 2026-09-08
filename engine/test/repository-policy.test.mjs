import assert from 'node:assert/strict'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { sha256 } from '../scripts/lib/files.mjs'
import {
  isProhibitedTrackedArtifact,
  parseLegacyCommitCostManifest,
  parsePublicArtifactManifest,
  resolveCommitCostEntry,
  verifyPublicArtifacts,
} from '../scripts/lib/repository-policy.mjs'

test('allows only an exact public presentation path, length, and digest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'public-artifact-'))
  const bytes = Buffer.from('reviewed generated deck')
  await writeFile(join(root, 'deck.pdf'), bytes)
  const manifest = {
    schemaVersion: '1.0',
    artifacts: [{ path: 'deck.pdf', kind: 'generated-presentation', bytes: bytes.length, sha256: await sha256(bytes) }],
  }
  const allowed = await verifyPublicArtifacts(root, ['deck.pdf'], manifest)
  assert.equal(isProhibitedTrackedArtifact('deck.pdf', allowed, new Set(), undefined), false)
  assert.equal(isProhibitedTrackedArtifact('assessment.pdf', allowed, new Set(), undefined), true)
  assert.equal(isProhibitedTrackedArtifact('catalog.db', allowed, new Set(), undefined), true)
  assert.equal(isProhibitedTrackedArtifact('.sdd/private.jsonl', allowed, new Set(), false), true)
  assert.equal(isProhibitedTrackedArtifact('.sdd/history/review/manifest.json', allowed, new Set(), true), false)

  await writeFile(join(root, 'deck.pdf'), Buffer.from('reviewed generated decK'))
  await assert.rejects(verifyPublicArtifacts(root, ['deck.pdf'], manifest), /SHA-256 changed/)
  await writeFile(join(root, 'deck.pdf'), 'short')
  await assert.rejects(verifyPublicArtifacts(root, ['deck.pdf'], manifest), /byte length changed/)
})

test('rejects malformed public artifact entries and missing allowlisted files', async () => {
  assert.throws(() => parsePublicArtifactManifest({
    schemaVersion: '1.0',
    artifacts: [{ path: '../deck.pdf', kind: 'generated-presentation', bytes: 1, sha256: 'a'.repeat(64) }],
  }), /repository-relative/)
  const root = await mkdtemp(join(tmpdir(), 'public-artifact-missing-'))
  await assert.rejects(verifyPublicArtifacts(root, [], {
    schemaVersion: '1.0',
    artifacts: [{ path: 'deck.pdf', kind: 'generated-presentation', bytes: 1, sha256: 'a'.repeat(64) }],
  }), /not tracked/)
})

test('accepts only the exact historical malformed trailer mapping backed by a known cost entry', () => {
  const sha = 'b'.repeat(40)
  const corrections = parseLegacyCommitCostManifest({
    schemaVersion: '1.0',
    commits: {
      [sha]: { observedTrailer: 'Template adding', changeId: 'template-adding', reason: 'Published historical typo.' },
    },
  })
  const known = new Set(['template-adding', 'valid-change'])
  assert.equal(resolveCommitCostEntry(sha, 'Update README\n\nCost-Entry: Template adding\n', known, corrections), 'template-adding')
  assert.equal(resolveCommitCostEntry('a'.repeat(40), 'Change\n\nCost-Entry: valid-change\n', known, corrections), 'valid-change')
  assert.throws(() => resolveCommitCostEntry('c'.repeat(40), 'Cost-Entry: Another typo', known, corrections), /missing or invalid/)
  assert.throws(() => resolveCommitCostEntry(sha, 'Cost-Entry: Different typo', known, corrections), /missing or invalid/)
  assert.throws(() => resolveCommitCostEntry('a'.repeat(40), 'Cost-Entry: unknown-change', known, corrections), /unknown Cost-Entry/)
})
