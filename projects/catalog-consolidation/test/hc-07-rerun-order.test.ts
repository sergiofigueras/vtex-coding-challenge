import assert from 'node:assert/strict';
import test from 'node:test';
import { temporaryDatabase, removeTemporaryDatabase, legacyDatabase, input, entry, consolidate, logicalState } from './hard-case-helpers.mjs';

test('AC-007-02: reruns insert nothing and permutations yield identical logical state', () => {
  const first = temporaryDatabase();
  const second = temporaryDatabase();
  const rows = [entry({ Id: '1', Name: 'Model One' }), entry({ Id: '2', SellerName: 'Seller B', Name: 'Model Two' })];
  try {
    legacyDatabase(first.database); legacyDatabase(second.database);
    consolidate(first.database, input(rows));
    const rerun = consolidate(first.database, input(rows));
    assert.deepEqual([rerun.insertedProducts, rerun.insertedLinks], [0, 0]);
    consolidate(second.database, input([...rows].reverse()));
    assert.deepEqual(logicalState(first.database), logicalState(second.database));
  } finally { removeTemporaryDatabase(first); removeTemporaryDatabase(second); }
});
