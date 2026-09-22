import assert from 'node:assert/strict';
import test from 'node:test';
import { temporaryDatabase, removeTemporaryDatabase, legacyDatabase, input, entry, consolidate } from './hard-case-helpers.mjs';

test('AC-007-03: formatting, accents, and all reviewed aliases match without insertion', () => {
  const fixture = temporaryDatabase();
  try {
    legacyDatabase(fixture.database, [
      { name: 'Router', brand: 'Acme', category: 'Electronics' },
      { name: 'Processor', brand: 'Acme', category: 'Components' },
      { name: 'Camera', brand: 'Acme', category: 'Photography' },
    ]);
    const result = consolidate(fixture.database, input([
      entry({ Id: '1', Name: ' Roteador ', Brand: 'Ácme', Category: 'Electronics' }),
      entry({ Id: '2', Name: 'PROCESSADOR', Category: 'Components' }),
      entry({ Id: '3', Name: 'Camera', Category: 'photo' }),
    ]));
    assert.deepEqual([result.insertedProducts, result.matchedProducts, result.insertedLinks], [0, 3, 3]);
  } finally { removeTemporaryDatabase(fixture); }
});
