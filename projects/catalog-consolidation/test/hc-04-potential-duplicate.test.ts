import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { temporaryDatabase, removeTemporaryDatabase, legacyDatabase, input, entry, consolidate } from './hard-case-helpers.mjs';

test('AC-007-03: catalog and in-batch potential duplicates roll back without mutation', () => {
  const catalogCase = temporaryDatabase();
  const batchCase = temporaryDatabase();
  try {
    legacyDatabase(catalogCase.database, [{ name: 'Model X', brand: 'Acme', category: 'Electronics' }]);
    const beforeCatalog = readFileSync(catalogCase.database);
    assert.throws(() => consolidate(catalogCase.database, input([entry({ Brand: null })])), /Identity resolution found/);
    assert.deepEqual(readFileSync(catalogCase.database), beforeCatalog);

    legacyDatabase(batchCase.database);
    const beforeBatch = readFileSync(batchCase.database);
    assert.throws(() => consolidate(batchCase.database, input([entry({ Id: 'one' }), entry({ Id: 'two', Category: 'Appliances' })])), /Identity resolution found/);
    assert.deepEqual(readFileSync(batchCase.database), beforeBatch);
  } finally { removeTemporaryDatabase(catalogCase); removeTemporaryDatabase(batchCase); }
});
