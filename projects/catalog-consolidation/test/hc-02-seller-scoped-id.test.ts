import assert from 'node:assert/strict';
import test from 'node:test';
import { temporaryDatabase, removeTemporaryDatabase, legacyDatabase, input, entry, consolidate } from './hard-case-helpers.mjs';

test('AC-007-03: opaque IDs are seller-scoped and same-seller conflicts reject before mutation', () => {
  const fixture = temporaryDatabase();
  try {
    legacyDatabase(fixture.database);
    const opaque = `external/sku'; --`;
    const first = consolidate(fixture.database, input([entry({ Id: opaque }), entry({ Id: opaque, SellerName: 'Seller B' })]));
    assert.equal(first.insertedLinks, 2);
    assert.throws(() => input([entry({ Id: opaque }), entry({ Id: opaque, Name: 'Other Model' })]), /Input validation failed/);
  } finally { removeTemporaryDatabase(fixture); }
});
