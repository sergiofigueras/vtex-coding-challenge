#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { consolidate, ConsolidationError } from "./application/consolidation.ts";
import { readInput } from "./adapters/fs-input.ts";
import { renderDiagnostics, renderJson, renderText } from "./adapters/reporter.ts";
import { CatalogMigrationError, verifyDatabase, verifyDatabasePath } from "./adapters/sqlite-catalog.ts";
import { parseAndValidateInput } from "./domain/input.ts";

type Format = "text" | "json";
type Options = { input: string; database: string; dryRun: boolean; format: Format; debug: boolean };
type ExpectedError = { schemaVersion: 1; runId: string; error: { code: string; message: string }; dryRun: boolean };
const HELP = `Usage: catalog-consolidate --input <products.json> --database <catalog.db> [--dry-run] [--format text|json] [--debug]\n`;

function commandError(message: string): never { process.stderr.write(`${message}\n${HELP}`); process.exit(2); }
function parseArgs(args: readonly string[]): Options {
  let input: string | undefined; let database: string | undefined; let dryRun = false; let format: Format = "text"; let debug = false;
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === "--help" || argument === "-h") { process.stdout.write(HELP); process.exit(0); }
    if (argument === "--dry-run") { if (dryRun) commandError("--dry-run was supplied more than once"); dryRun = true; continue; }
    if (argument === "--debug") { debug = true; continue; }
    if (argument === "--input" || argument === "--database" || argument === "--format") {
      const value = args[++i]; if (value === undefined || value.startsWith("--")) commandError(`${argument} requires a value`);
      if (argument === "--input") { if (input !== undefined) commandError("--input was supplied more than once"); input = value; }
      else if (argument === "--database") { if (database !== undefined) commandError("--database was supplied more than once"); database = value; }
      else if (value === "text" || value === "json") format = value; else commandError("--format must be text or json");
      continue;
    }
    commandError(`unknown argument: ${argument}`);
  }
  if (input === undefined) commandError("--input is required"); if (database === undefined) commandError("--database is required");
  return { input: resolve(input), database: resolve(database), dryRun, format, debug };
}
function expected(options: Options, runId: string, code: string, message: string, exitCode: number): void {
  if (options.format === "json") process.stdout.write(renderJson({ schemaVersion: 1, runId, error: { code, message }, dryRun: options.dryRun }));
  else process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = exitCode;
}
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2)); const runId = randomUUID();
  let bytes: string;
  try { [bytes] = await Promise.all([readInput(options.input), verifyDatabasePath(options.database)]); }
  catch { expected(options, runId, "unreadable_path", "input or database path is unreadable", 2); return; }
  try { verifyDatabase(options.database); } catch { expected(options, runId, "database_failure", "database could not be opened", 4); return; }
  const validation = parseAndValidateInput(bytes);
  if (!validation.ok) { if (options.format === "json") expected(options, runId, validation.error.diagnostics[0]?.code ?? "invalid_input", "input validation failed", 2); else { process.stderr.write(renderDiagnostics(validation.error.diagnostics, validation.error.diagnosticsTruncated)); process.exitCode = 2; } return; }
  try {
    const started = performance.now();
    const summary = consolidate(validation.value, options.database, options.dryRun, runId, Math.round(performance.now() - started));
    process.stdout.write(options.format === "json" ? renderJson(summary) : renderText(summary));
  } catch (error) {
    const sqliteCode = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    const code = error instanceof ConsolidationError ? error.code : error instanceof CatalogMigrationError && /newer than supported/.test(error.message) ? "unsupported_schema_version" : sqliteCode === "ERR_SQLITE_BUSY" || sqliteCode === "SQLITE_BUSY" ? "database_busy" : error instanceof CatalogMigrationError ? "migration_failure" : "database_failure";
    const status = error instanceof ConsolidationError && error.code === "identity_ambiguity" ? 3 : 4;
    expected(options, runId, code, error instanceof Error ? error.message : "database operation failed", status);
    if (options.debug && error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
  }
}
void main().catch((error: unknown) => { process.stderr.write(error instanceof Error ? `${error.message}\n` : "unexpected failure\n"); process.exitCode = 1; });
