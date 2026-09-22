import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { temporaryDatabase, removeTemporaryDatabase, legacyDatabase, input, entry, consolidate } from './hard-case-helpers.mjs';

test('AC-007-03: hostile strings remain data and schema plus foreign keys stay intact', () => {
  const fixture = temporaryDatabase();
  const hostile = `name'; DROP TABLE Product; -- \\u001b[31m`;
  try {
    legacyDatabase(fixture.database);
    consolidate(fixture.database, input([entry({ Id: hostile, SellerName: hostile, Name: hostile, Brand: hostile, Category: hostile })]));
    const database = new DatabaseSync(fixture.database, { readOnly: true });
    assert.equal(database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Product'").get().name, 'Product');
    assert.equal(database.prepare('SELECT Name FROM Product').get().Name, hostile);
    assert.deepEqual(database.prepare('PRAGMA foreign_key_check').all(), []);
    database.close();
  } finally { removeTemporaryDatabase(fixture); }
});
