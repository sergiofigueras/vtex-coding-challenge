import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';

const cliPath = new URL('../dist/cli.js', import.meta.url).pathname;

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function runCli(arguments_) {
  return spawnSync(process.execPath, [cliPath, ...arguments_], { encoding: 'utf8' });
}

function createFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'catalog-consolidation-'));
  const input = join(directory, 'products.json');
  const database = join(directory, 'catalog.db');
  writeFileSync(input, JSON.stringify([
    { Id: 'seller-sku', SellerName: 'Seller A', Name: 'Example', Brand: null, Category: 'Example' },
    { Id: 'seller-sku', SellerName: 'Seller A', Name: 'Example', Brand: null, Category: 'Example' },
  ]));
  new DatabaseSync(database).close();
  return { directory, input, database };
}

test('AC-001-01: CLI validates required paths and flags before SQLite planning', () => {
  const missing = runCli(['--input', 'missing.json', '--database', 'missing.db']);
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /Input path is missing or unreadable/);

  const invalid = runCli(['--unknown']);
  assert.equal(invalid.status, 2);
  assert.match(invalid.stderr, /Unknown option/);
});

test('AC-001-02: dry-run returns planned counts without database byte changes', () => {
  const fixture = createFixture();
  try {
    const before = sha256(fixture.database);
    const dryRun = runCli(['--input', fixture.input, '--database', fixture.database, '--dry-run', '--format', 'json']);
    assert.equal(dryRun.status, 0, dryRun.stderr);
    assert.equal(sha256(fixture.database), before);

    const actual = runCli(['--input', fixture.input, '--database', fixture.database, '--format', 'json']);
    assert.equal(actual.status, 0, actual.stderr);
    const drySummary = JSON.parse(dryRun.stdout);
    const actualSummary = JSON.parse(actual.stdout);
    for (const key of ['inputRows', 'distinctSellerEntries', 'matchedProducts', 'insertedProducts', 'insertedLinks', 'alreadyPresentLinks', 'rejectedRows', 'ambiguousRows']) {
      assert.equal(drySummary[key], actualSummary[key]);
    }
    assert.equal(drySummary.inputRows, 2);
    assert.equal(drySummary.distinctSellerEntries, 1);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});

test('AC-001-03: consolidation service runs with in-memory ports only', async () => {
  const { ConsolidationService } = await import('../dist/application/consolidation-service.js');
  const repository = { withPlanningTransaction: (operation) => operation() };
  const resolver = { plan: (entries) => ({ inputRows: entries.length, distinctSellerEntries: entries.length, matchedProducts: 1, insertedProducts: 0, insertedLinks: 1, alreadyPresentLinks: 0, rejectedRows: 0, ambiguousRows: 0 }) };
  const result = new ConsolidationService(repository, resolver).plan([{ id: '1', sellerName: 'seller' }], { dryRun: true, databasePath: 'memory.db', elapsedMilliseconds: 0 });
  assert.equal(result.insertedLinks, 1);
  assert.equal(result.databasePath, '<redacted>');
});

test('AC-001-04: JSON output is a single versioned summary and text is concise', () => {
  const fixture = createFixture();
  try {
    const json = runCli(['--input', fixture.input, '--database', fixture.database, '--format', 'json']);
    assert.equal(json.status, 0, json.stderr);
    assert.equal(json.stdout.trim().split('\n').length, 1);
    const summary = JSON.parse(json.stdout);
    assert.equal(summary.version, '1');
    assert.equal(summary.databasePath, '<redacted>');
    assert.doesNotMatch(json.stdout, /Warning|ExperimentalWarning/);

    const text = runCli(['--input', fixture.input, '--database', fixture.database]);
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^Catalog consolidation completed\./);
    assert.doesNotMatch(text.stdout, /Warning|ExperimentalWarning/);
  } finally {
    rmSync(fixture.directory, { recursive: true, force: true });
  }
});
