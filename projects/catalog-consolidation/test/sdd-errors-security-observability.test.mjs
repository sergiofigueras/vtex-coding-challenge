import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;
const repositoryPath = new URL('../src/adapters/sqlite-catalog-repository.ts', import.meta.url);
const sourcePaths = [
  new URL('../src/cli.ts', import.meta.url),
  new URL('../src/adapters/sqlite-catalog-repository.ts', import.meta.url),
  new URL('../src/adapters/json-input-reader.ts', import.meta.url),
];

function runCli(arguments_, options = {}) {
  return spawnSync(process.execPath, [cliPath, ...arguments_], {
    encoding: 'utf8',
    env: { ...process.env, NODE_NO_WARNINGS: '1', ...(options.env ?? {}) },
    ...options,
  });
}

function fixture(input) {
  const directory = mkdtempSync(join(tmpdir(), 'catalog-safety-'));
  const inputPath = join(directory, 'products.json');
  const database = join(directory, 'catalog.db');
  writeFileSync(inputPath, JSON.stringify(input));
  new DatabaseSync(database).close();
  return { directory, inputPath, database };
}

function entry(overrides = {}) {
  return { Id: 'sku', SellerName: 'Seller', Name: 'Model', Brand: 'Acme', Category: 'Electronics', ...overrides };
}

test('AC-006-01: expected failures have stable codes, JSON envelopes, and opt-in debug stacks', () => {
  const invalid = fixture([{ Id: 'sku' }]);
  try {
    const json = runCli(['--input', invalid.inputPath, '--database', invalid.database, '--format', 'json']);
    assert.equal(json.status, 2);
    assert.equal(json.stdout, '');
    const summary = JSON.parse(json.stderr);
    assert.deepEqual([summary.version, summary.status, summary.code, summary.exitCode], ['1', 'failure', 'E_INVALID_ROW', 2]);
    assert.ok(/^run-/.test(summary.runId));
    assert.doesNotMatch(json.stderr, /\bat\s+.*\.js:/);

    const plain = runCli(['--input', invalid.inputPath, '--database', invalid.database]);
    assert.equal(plain.status, 2);
    assert.doesNotMatch(plain.stderr, /InputValidationError|\bat\s+.*\.js:/);

    const debug = runCli(['--input', invalid.inputPath, '--database', invalid.database, '--debug']);
    assert.equal(debug.status, 2);
    assert.match(debug.stderr, /InputValidationError: Input validation failed\.|\bat\s+.*\.js:/);
  } finally { rmSync(invalid.directory, { recursive: true, force: true }); }
});

test('AC-006-02: repository SQL binds hostile values and cannot alter schema', () => {
  const source = readFileSync(repositoryPath, 'utf8');
  for (const statement of [
    'INSERT INTO Product (Name, Brand, Category) VALUES (?, ?, ?)',
    'INSERT INTO SellerProduct (SellerName, ProductId, SellerProductId) VALUES (?, ?, ?)',
    'SELECT ProductId AS productId FROM SellerProduct WHERE SellerName = ? AND SellerProductId = ?',
  ]) assert.match(source, new RegExp(statement.replace(/[()?]/g, '\\$&')));

  const hostile = `value'; DROP TABLE Product; -- \u001b[31m`;
  const current = fixture([entry({ Id: hostile, SellerName: hostile, Name: hostile, Brand: hostile, Category: hostile })]);
  try {
    const result = runCli(['--input', current.inputPath, '--database', current.database, '--format', 'json']);
    assert.equal(result.status, 0, result.stderr);
    const db = new DatabaseSync(current.database, { readOnly: true });
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'Product'").get().name, 'Product');
    assert.equal(db.prepare('SELECT Name FROM Product').get().Name, hostile);
    db.close();
  } finally { rmSync(current.directory, { recursive: true, force: true }); }
});

test('AC-006-03: summaries expose bounded metadata and redact paths and row values', () => {
  const secretLikeValue = 'do-not-disclose-product-value';
  const current = fixture([entry({ Name: secretLikeValue })]);
  try {
    const result = runCli(['--input', current.inputPath, '--database', current.database, '--format', 'json']);
    assert.equal(result.status, 0, result.stderr);
    const summary = JSON.parse(result.stdout);
    assert.deepEqual([summary.version, summary.status, summary.normalizationVersion, summary.schemaVersion], ['1', 'success', 1, 1]);
    assert.equal(summary.databasePath, '<redacted>');
    assert.ok(summary.elapsedMilliseconds >= 0);
    assert.ok(/^run-/.test(summary.runId));
    assert.doesNotMatch(result.stdout, new RegExp(secretLikeValue));
    assert.doesNotMatch(result.stdout, new RegExp(current.directory.replace(/[\\/]/g, '\\$&')));

    const verbose = runCli(['--input', current.inputPath, '--database', current.database, '--format', 'json', '--verbose-local']);
    assert.equal(JSON.parse(verbose.stdout).databasePath, current.database);

    const tooLarge = join(current.directory, 'too-large.json');
    writeFileSync(tooLarge, ' '.repeat(5 * 1024 * 1024 + 1));
    const limited = runCli(['--input', tooLarge, '--database', current.database, '--format', 'json']);
    assert.equal(limited.status, 2);
    assert.equal(JSON.parse(limited.stderr).code, 'E_COMMAND_VALIDATION');
  } finally { rmSync(current.directory, { recursive: true, force: true }); }
});

test('AC-006-04: runtime has no network or model-provider dependency and accepts an empty credential environment', () => {
  for (const path of sourcePaths) {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /node:(?:net|http|https|tls|dns)|\bfetch\(|openai|deepseek/i);
  }
  const current = fixture([entry()]);
  try {
    const result = runCli(['--input', current.inputPath, '--database', current.database, '--format', 'json'], {
      env: { PATH: process.env.PATH, NODE_NO_WARNINGS: '1' },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 'success');
  } finally { rmSync(current.directory, { recursive: true, force: true }); }
});
