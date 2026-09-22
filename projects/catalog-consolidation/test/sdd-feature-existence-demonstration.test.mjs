import test from 'node:test';
import assert from 'node:assert/strict';
import { runFeatureDemo } from '../scripts/demo-feature.mjs';

test('AC-011-01 through AC-011-04: disposable CLI demonstration proves dry-run, commit, and replay', () => {
  const result = runFeatureDemo();
  assert.equal(result.dryRunSummary.dryRun, true);
  assert.equal(result.dryRunSummary.insertedProducts, 1);
  assert.equal(result.dryRunSummary.insertedLinks, 3);
  assert.equal(result.firstSummary.dryRun, false);
  assert.equal(result.firstSummary.insertedProducts, 1);
  assert.equal(result.firstSummary.insertedLinks, 3);
  assert.equal(result.replaySummary.insertedProducts, 0);
  assert.equal(result.replaySummary.insertedLinks, 0);
  assert.deepEqual(result.finalCounts, { products: 2, links: 3 });
});
