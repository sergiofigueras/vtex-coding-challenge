import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const EXISTING_PRODUCT = { name: 'Router Pro', brand: 'Acme', category: 'Networking' };

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function createStartingCatalog(path) {
  const database = new DatabaseSync(path);
  try {
    database.exec('CREATE TABLE Product (Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT); CREATE TABLE SellerProduct (Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL);');
    database.prepare('INSERT INTO Product (Name, Brand, Category) VALUES (?, ?, ?)').run(
      EXISTING_PRODUCT.name,
      EXISTING_PRODUCT.brand,
      EXISTING_PRODUCT.category,
    );
  } finally {
    database.close();
  }
}

function syntheticInput() {
  return JSON.stringify([
    { Id: 'north-router', SellerName: 'North Seller', Name: 'Róutér Pro', Brand: 'Acme', Category: 'Networking' },
    { Id: 'south-router', SellerName: 'South Seller', Name: 'Router Pro', Brand: 'Acme', Category: 'Networking' },
    { Id: 'north-gateway', SellerName: 'North Seller', Name: 'Gateway Mini', Brand: 'Acme', Category: 'Networking' },
  ]);
}

function runCli(inputPath, databasePath, dryRun) {
  const result = spawnSync(process.execPath, ['--no-warnings', 'dist/cli.js', '--input', inputPath, '--database', databasePath, '--format', 'json', ...(dryRun ? ['--dry-run'] : [])], {
    encoding: 'utf8',
  });
  assert(result.status === 0 && result.error === undefined, 'CLI child exited unsuccessfully.');
  assert(result.stderr === '', 'CLI child wrote unexpected diagnostics.');
  try {
    const summary = JSON.parse(result.stdout);
    assert(summary !== null && typeof summary === 'object' && !Array.isArray(summary), 'CLI summary was not an object.');
    assert(summary.version === '1' && summary.status === 'success', 'CLI summary envelope was unexpected.');
    return summary;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('CLI summary was malformed JSON.');
    throw error;
  }
}

function assertPlannedDelta(summary, dryRun) {
  assert(summary.dryRun === dryRun, 'CLI summary dry-run state was unexpected.');
  assert(summary.insertedProducts === 1, 'CLI summary product delta was unexpected.');
  assert(summary.insertedLinks === 3, 'CLI summary seller-link delta was unexpected.');
}

function tableCounts(path) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    return {
      products: Number(database.prepare('SELECT COUNT(*) AS count FROM Product').get().count),
      links: Number(database.prepare('SELECT COUNT(*) AS count FROM SellerProduct').get().count),
    };
  } finally {
    database.close();
  }
}

function assertCommittedRelationships(path) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = database.prepare('SELECT SellerName, SellerProductId, ProductId FROM SellerProduct ORDER BY SellerProductId').all();
    assert(rows.length === 3, 'Committed seller-link count was unexpected.');
    const byEntryId = new Map(rows.map((row) => [row.SellerProductId, row]));
    const northExisting = byEntryId.get('north-router');
    const southExisting = byEntryId.get('south-router');
    const distinct = byEntryId.get('north-gateway');
    assert(northExisting !== undefined && southExisting !== undefined && distinct !== undefined, 'Expected seller links were missing.');
    assert(northExisting.ProductId === southExisting.ProductId, 'Existing product was not reused by both sellers.');
    assert(distinct.ProductId !== northExisting.ProductId, 'Distinct product was not kept separate.');
  } finally {
    database.close();
  }
}

/** Executes the disposable public scenario; throws with a phase-only failure. */
export function runFeatureDemo() {
  const directory = mkdtempSync(join(tmpdir(), 'catalog-feature-demo-'));
  let phase = 'setup';
  try {
    const inputPath = join(directory, 'products.json');
    const databasePath = join(directory, 'catalog.db');
    createStartingCatalog(databasePath);
    writeFileSync(inputPath, syntheticInput(), 'utf8');

    phase = 'dry-run';
    const beforeDryRun = sha256(databasePath);
    const dryRunSummary = runCli(inputPath, databasePath, true);
    assertPlannedDelta(dryRunSummary, true);
    assert(sha256(databasePath) === beforeDryRun, 'Dry-run changed the starting database.');

    phase = 'first-commit';
    const firstSummary = runCli(inputPath, databasePath, false);
    assertPlannedDelta(firstSummary, false);
    const committedCounts = tableCounts(databasePath);
    assert(committedCounts.products === 2 && committedCounts.links === 3, 'First commit table counts were unexpected.');
    assertCommittedRelationships(databasePath);

    phase = 'idempotent-replay';
    const replaySummary = runCli(inputPath, databasePath, false);
    assert(replaySummary.dryRun === false, 'Replay summary dry-run state was unexpected.');
    assert(replaySummary.insertedProducts === 0 && replaySummary.insertedLinks === 0, 'Replay was not idempotent.');
    const replayCounts = tableCounts(databasePath);
    assert(replayCounts.products === committedCounts.products && replayCounts.links === committedCounts.links, 'Replay changed final table counts.');

    return { dryRunSummary, firstSummary, replaySummary, finalCounts: replayCounts };
  } catch {
    throw new Error(`Feature demonstration failed during ${phase}.`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    runFeatureDemo();
    process.stdout.write('Feature demonstration passed.\n');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Feature demonstration failed.';
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}
