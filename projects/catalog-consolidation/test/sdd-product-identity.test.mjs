import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const identity = await import('../dist/domain/product-identity.js');
const resolver = await import('../dist/adapters/deterministic-product-resolver.js');
const input = await import('../dist/adapters/json-input-reader.js');
const databasePath = new URL('../.sdd/inputs/catalog.db', import.meta.url);
const inputPath = new URL('../.sdd/inputs/ProductEntry.json', import.meta.url);

function product(id, overrides = {}) {
  return { id, name: 'Model X', brand: 'Acme', category: 'Electronics', ...overrides };
}

function entry(overrides = {}) {
  return { Id: 'seller-id', SellerName: 'Seller', Name: 'Model X', Brand: 'Acme', Category: 'Electronics', ...overrides };
}

test('AC-004-01: canonicalization is deterministic across equivalent ordering and locale-shaped text', () => {
  const values = [
    { name: ' Café—Maker ', brand: null, category: 'HOME / Kitchen' },
    { name: 'cafe maker', brand: '', category: 'home kitchen' },
  ];
  const expected = identity.canonicalizeProduct(values[0]);
  assert.deepEqual(identity.canonicalizeProduct(values[1]), expected);
  assert.deepEqual(identity.canonicalizeProduct(values[0]), expected);
  assert.equal(expected.version, 1);
});

test('AC-004-02: whitespace, accents, quotes, punctuation, and reviewed aliases resolve exactly', () => {
  const catalog = [
    product(1, { name: 'Router', brand: 'O’Reilly', category: 'Photography' }),
    product(2, { name: 'Processor', brand: 'Brand', category: 'Computers' }),
  ];
  const results = identity.resolveProducts([
    { name: '  roteador  ', brand: "O'Reilly", category: 'photo' },
    { name: 'processador', brand: 'Brand', category: 'Computers' },
  ], catalog);
  assert.deepEqual(results.map((result) => result.kind === 'matched' ? result.productId : result.kind), [1, 2]);
  assert.match(results[0].identity.rulesUsed.join(','), /alias:name:roteador->router/);
  assert.match(results[0].identity.rulesUsed.join(','), /alias:category:photo->photography/);
});

test('AC-004-02: reviewed aliases match complete words inside product names, not substrings', () => {
  const catalog = [
    product(21, { name: 'Router WiFi 6 TP-Link', brand: 'TP-Link', category: 'Networking' }),
    product(28, { name: 'Processor AMD Ryzen 9 7950X', brand: 'AMD', category: 'Components' }),
  ];
  const results = identity.resolveProducts([
    { name: 'Roteador WiFi 6 TP-Link', brand: 'TP-Link', category: 'Networking' },
    { name: 'Processador AMD Ryzen 9 7950X', brand: 'AMD', category: 'Components' },
  ], catalog);
  assert.deepEqual(results.map((result) => result.kind === 'matched' ? result.productId : result.kind), [21, 28]);
  assert.match(results[0].identity.rulesUsed.join(','), /alias:name:roteador->router/);
  assert.match(results[1].identity.rulesUsed.join(','), /alias:name:processador->processor/);
  assert.equal(identity.canonicalizeField('Microprocessador AMD', 'name').value, 'microprocessador amd');
});

test('AC-004-03: injection-shaped display values stay a new literal product candidate', () => {
  const unsafe = "New '; DROP TABLE Product; -- café";
  const [result] = identity.resolveProducts([{ name: unsafe, brand: unsafe, category: unsafe }], [product(1)]);
  assert.equal(result.kind, 'new');
  assert.equal(unsafe, "New '; DROP TABLE Product; -- café");
});

test('AC-004-04: canonical fingerprint collisions are explicit bounded ambiguities', () => {
  const [result] = identity.resolveProducts([product(99)], [product(7), product(8)]);
  assert.equal(result.kind, 'ambiguous');
  assert.equal(result.reason, 'fingerprint_collision');
  assert.deepEqual(result.candidateIds, ['7', '8']);
});

test('AC-004-05: aliases are versioned checked-in data and collision checked without display mutation', () => {
  assert.throws(
    () => identity.assertAliasesDoNotCollide([product(1, { name: 'roteador' }), product(2, { name: 'router' })]),
    /Alias version 1 collapses/,
  );
  assert.throws(
    () => identity.assertAliasesDoNotCollide([product(1, { name: 'Roteador WiFi 6' }), product(2, { name: 'Router WiFi 6' })]),
    /Alias version 1 collapses/,
  );
  const original = product(1, { name: ' Roteador ' });
  const [matched] = identity.resolveProducts([entry()], [original]);
  assert.equal(original.name, ' Roteador ');
  assert.equal(matched.kind, 'new');
});

test('AC-004-06: potential duplicates against catalog and batch abort planning while distinct models remain new', () => {
  const catalogResult = identity.resolveProducts([product(99, { brand: null })], [product(5)]);
  assert.equal(catalogResult[0].kind, 'ambiguous');
  assert.equal(catalogResult[0].reason, 'potential_duplicate');
  assert.deepEqual(catalogResult[0].candidateIds, ['5']);

  const batchResult = identity.resolveProducts([product(1), product(2, { category: 'Computers' })], []);
  assert.equal(batchResult[0].kind, 'new');
  assert.equal(batchResult[1].kind, 'ambiguous');
  assert.deepEqual(batchResult[1].candidateIds, ['planned:1']);
  const validated = new input.JsonInputReader().read(JSON.stringify([
    entry(), entry({ Id: 'other-id', Category: 'Computers' }),
  ]));
  assert.throws(
    () => new resolver.DeterministicProductResolver().plan(validated),
    /Identity resolution found 1 ambiguous product entry/,
  );

  const [distinct] = identity.resolveProducts([product(3, { name: 'Model X Pro' })], [product(5)]);
  assert.equal(distinct.kind, 'new');
});

test('AC-004-02 fixture oracle: canonical exact matches resolve from supplied catalog without mutation', () => {
  const entries = new input.JsonInputReader().read(readFileSync(inputPath, 'utf8'));
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const catalog = database.prepare('SELECT Id AS id, Name AS name, Brand AS brand, Category AS category FROM Product').all();
    const results = identity.resolveProducts(entries, catalog);
    assert.equal(results.filter((result) => result.kind === 'matched').length, 267);
    assert.equal(results.filter((result) => result.kind === 'new').length, 1);
  } finally {
    database.close();
  }
});
