import assert from 'node:assert/strict';
import test from 'node:test';
import { temporaryDatabase, removeTemporaryDatabase, legacyDatabase, input, entry, consolidate, logicalState } from './hard-case-helpers.mjs';

test('AC-007-03: two sellers matching one canonical product create one product and two links', () => {
  const fixture = temporaryDatabase();
  try {
    legacyDatabase(fixture.database);
    const result = consolidate(fixture.database, input([entry(), entry({ Id: 'sku-2', SellerName: 'Seller B' })]));
    assert.deepEqual([result.insertedProducts, result.insertedLinks], [1, 2]);
    assert.equal(logicalState(fixture.database).products.length, 1);
  } finally { removeTemporaryDatabase(fixture); }
});
