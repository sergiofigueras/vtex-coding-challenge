import assert from 'node:assert/strict';
import test from 'node:test';
import { temporaryDatabase, removeTemporaryDatabase, legacyDatabase, input, entry, consolidate } from './hard-case-helpers.mjs';

test('AC-007-03: distinct model names do not false-merge', () => {
  const fixture = temporaryDatabase();
  try {
    legacyDatabase(fixture.database, [{ name: 'Model X', brand: 'Acme', category: 'Electronics' }]);
    const result = consolidate(fixture.database, input([entry({ Name: 'Model X Pro' })]));
    assert.deepEqual([result.insertedProducts, result.matchedProducts], [1, 0]);
  } finally { removeTemporaryDatabase(fixture); }
});
