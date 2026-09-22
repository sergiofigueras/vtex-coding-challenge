import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const readerModule = await import('../dist/adapters/json-input-reader.js');
const contractsModule = await import('../dist/domain/contracts.js');
const resolverModule = await import('../dist/adapters/deterministic-product-resolver.js');
const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
const fixturePath = new URL('../.sdd/inputs/ProductEntry.json', import.meta.url);

function entry(overrides = {}) {
  return {
    Id: 'opaque-sku',
    SellerName: 'Seller One',
    Name: 'Product name',
    Brand: null,
    Category: 'Category',
    ...overrides,
  };
}

function inputError(value) {
  assert.throws(
    () => new readerModule.JsonInputReader().read(JSON.stringify(value)),
    (error) => error instanceof contractsModule.InputValidationError,
  );
  try {
    new readerModule.JsonInputReader().read(JSON.stringify(value));
  } catch (error) {
    return error;
  }
  throw new Error('Expected input validation error.');
}

function runCli(arguments_) {
  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1' },
  });
}

test('AC-002-01: ingested snapshot accepts nullable brands and opaque IDs', async () => {
  const bytes = await import('node:fs/promises').then(({ readFile }) => readFile(fixturePath, 'utf8'));
  const entries = new readerModule.JsonInputReader().read(bytes);
  assert.equal(entries.inputRowCount, 269);
  assert.equal(entries.length, 268);
  assert.ok(entries.some(({ brand }) => brand === null));
  assert.ok(entries.some(({ id }) => !/^[0-9a-f]{8}-/i.test(id)));
});

test('AC-002-02: exact seller entries are idempotent but conflicts reject the whole batch', () => {
  const reader = new readerModule.JsonInputReader();
  const entries = reader.read(JSON.stringify([entry(), entry()]));
  assert.equal(entries.length, 1);
  const counts = new resolverModule.DeterministicProductResolver().plan(entries);
  assert.equal(counts.inputRows, 2);
  assert.equal(counts.distinctSellerEntries, 1);

  const error = inputError([entry(), entry({ Name: 'Changed product' })]);
  assert.equal(error.invalidRowCount, 1);
  assert.deepEqual(error.diagnostics, [{
    sourceIndex: 2,
    code: 'E_SELLER_ENTRY_CONFLICT',
    message: 'Seller entry is reused with different product attributes.',
  }]);

  const otherSeller = reader.read(JSON.stringify([entry(), entry({ SellerName: 'Seller Two' })]));
  assert.equal(otherSeller.length, 2);
});

test('AC-002-03: invalid input emits bounded, stable one-based diagnostics without a stack trace', () => {
  const reader = new readerModule.JsonInputReader();
  const cases = [
    ['non-array root', { Id: 'x' }, 'E_ROOT_TYPE'],
    ['missing field', [entry({ Name: undefined })], 'E_MISSING_FIELD'],
    ['unknown field', [{ ...entry(), Extra: true }], 'E_UNKNOWN_FIELD'],
    ['wrong type', [entry({ Brand: 1 })], 'E_FIELD_TYPE'],
    ['whitespace required string', [entry({ Category: ' \t' })], 'E_FIELD_EMPTY'],
    ['overlength field', [entry({ Name: 'x'.repeat(2049) })], 'E_FIELD_LENGTH'],
  ];
  for (const [, input, code] of cases) {
    const error = inputError(input);
    if (code !== 'E_ROOT_TYPE') assert.equal(error.diagnostics[0].sourceIndex, 1);
    assert.equal(error.diagnostics[0].code, code);
  }
  assert.throws(
    () => reader.read('{'),
    (error) => error instanceof contractsModule.InputValidationError && error.diagnostics[0].code === 'E_JSON_PARSE',
  );

  const rows = Array.from({ length: 25 }, () => ({ Id: 'x', SellerName: 's', Name: 'n', Brand: null, Category: 'c', Extra: true }));
  const error = inputError(rows);
  assert.equal(error.invalidRowCount, 25);
  assert.equal(error.diagnostics.length, 20);
  assert.equal(error.diagnostics[0].sourceIndex, 1);
  assert.equal(error.diagnostics[0].code, 'E_UNKNOWN_FIELD');
  assert.equal(error.diagnosticsTruncated, true);

  const directory = mkdtempSync(join(tmpdir(), 'catalog-validation-'));
  try {
    const input = join(directory, 'invalid.json');
    const database = join(directory, 'catalog.db');
    writeFileSync(input, JSON.stringify(rows));
    new DatabaseSync(database).close();
    const result = runCli(['--input', input, '--database', database]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /^Input validation failed \(25 invalid inputs\)\./);
    assert.match(result.stderr, /row 1: E_UNKNOWN_FIELD/);
    assert.match(result.stderr, /E_DIAGNOSTICS_TRUNCATED/);
    assert.doesNotMatch(result.stderr, /InputValidationError|\bat\s+.*\.js:/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('AC-002-04: SQL-shaped and control-looking strings remain literal data', () => {
  const payload = `quotes ' "; semicolon; -- comment /* block */ café \u0000 \u001b[31m`;
  const [parsed] = new readerModule.JsonInputReader().read(JSON.stringify([
    entry({ Id: payload, SellerName: payload, Name: payload, Brand: payload, Category: payload }),
  ]));
  assert.equal(parsed.id, payload);
  assert.equal(parsed.sellerName, payload);
  assert.equal(parsed.name, payload);
  assert.equal(parsed.brand, payload);
  assert.equal(parsed.category, payload);

  const directory = mkdtempSync(join(tmpdir(), 'catalog-data-boundary-'));
  try {
    const input = join(directory, 'payload.json');
    const database = join(directory, 'catalog.db');
    writeFileSync(input, JSON.stringify([entry({ Id: payload, SellerName: payload, Name: payload, Brand: payload, Category: payload })]));
    const db = new DatabaseSync(database);
    db.exec('CREATE TABLE Product (Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT)');
    db.close();
    const result = runCli(['--input', input, '--database', database, '--format', 'json']);
    assert.equal(result.status, 0, result.stderr);
    const checked = new DatabaseSync(database, { readOnly: true });
    assert.equal(checked.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Product'").get().name, 'Product');
    checked.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
