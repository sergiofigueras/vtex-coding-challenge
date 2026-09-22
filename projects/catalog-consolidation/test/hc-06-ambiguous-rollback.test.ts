import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { temporaryDatabase, removeTemporaryDatabase, legacyDatabase, input, entry, consolidate, logicalState } from './hard-case-helpers.mjs';

test('AC-007-03: fingerprint collision and seller-link conflict roll back the batch', () => {
  const ambiguous = temporaryDatabase();
  const conflict = temporaryDatabase();
  try {
    legacyDatabase(ambiguous.database, [
      { name: 'Model X', brand: 'Acme', category: 'Electronics' },
      { name: 'model x', brand: 'acme', category: 'electronics' },
    ]);
    const beforeAmbiguous = logicalState(ambiguous.database);
    assert.throws(() => consolidate(ambiguous.database, input([entry({ Id: 'other' })])), /Product identity backfill collision/);
    assert.deepEqual(logicalState(ambiguous.database), beforeAmbiguous);

    legacyDatabase(conflict.database);
    consolidate(conflict.database, input([entry()]));
    const conflictDb = new DatabaseSync(conflict.database);
    conflictDb.prepare('INSERT INTO Product (Name, Brand, Category) VALUES (?, ?, ?)').run('Different', 'Acme', 'Electronics');
    const differentId = conflictDb.prepare('SELECT max(Id) AS id FROM Product').get().id;
    conflictDb.prepare('INSERT INTO ProductIdentity (ProductId, CanonicalVersion, CanonicalName, CanonicalBrand, CanonicalCategory, Fingerprint) VALUES (?, ?, ?, ?, ?, ?)').run(differentId, 1, 'different', 'acme', 'electronics', 'v1\u0000different\u0000acme\u0000electronics');
    conflictDb.prepare('UPDATE SellerProduct SET ProductId = ?').run(differentId);
    conflictDb.close();
    const beforeConflict = logicalState(conflict.database);
    assert.throws(() => consolidate(conflict.database, input([entry()])), /Seller link conflict/);
    assert.deepEqual(logicalState(conflict.database), beforeConflict);
  } finally { removeTemporaryDatabase(ambiguous); removeTemporaryDatabase(conflict); }
});
