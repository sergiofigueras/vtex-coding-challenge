#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { ConsolidationError } from "./application/consolidation.ts";
import { InputReadError, readInput } from "./adapters/fs-input.ts";
import { renderDiagnostics, renderJson, renderText } from "./adapters/reporter.ts";
import { CatalogMigrationError, consolidate, verifyDatabase, verifyDatabasePath } from "./adapters/sqlite-catalog.ts";
import { parseAndValidateInput } from "./domain/input.ts";
import { withOperationalLimits, type OperationalLimits } from "./domain/operational-limits.ts";

type Format = "text" | "json";
type Options = { input: string; database: string; dryRun: boolean; format: Format; debug: boolean; limits: OperationalLimits };
type ExpectedError = { schemaVersion: 1; runId: string; error: { code: string; message: string }; dryRun: boolean };
type LimitOverrides = { -readonly [K in keyof OperationalLimits]?: OperationalLimits[K] };
const HELP = `Usage: catalog-consolidate --input <products.json> --database <catalog.db> [--dry-run] [--format text|json] [--debug]\n\nOperational limits (defaults):\n  --max-input-bytes <positive-integer>  Maximum input file size (268435456 bytes / 256 MiB)\n  --max-rows <positive-integer>         Maximum JSON array rows (1000000)\n  --max-field-length <positive-integer> Maximum characters in each field (16384)\n  --max-diagnostics <positive-integer>  Maximum rendered row diagnostics (100)\n  --busy-timeout-ms <non-negative-integer> SQLite lock wait (30000 ms; zero means no wait)\n`;

function commandError(message: string): never { process.stderr.write(`${message}\n${HELP}`); process.exit(2); }
function parseLimit(argument: string, value: string, allowsZero: boolean): number {
  if (!/^\d+$/.test(value)) commandError(`${argument} must be a ${allowsZero ? "non-negative" : "positive"} safe integer`);
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || (!allowsZero && parsed === 0)) commandError(`${argument} must be a ${allowsZero ? "non-negative" : "positive"} safe integer`);
  return parsed;
}
function parseArgs(args: readonly string[]): Options {
  let input: string | undefined; let database: string | undefined; let dryRun = false; let format: Format = "text"; let debug = false;
  const limitOverrides: LimitOverrides = {}; const suppliedLimits = new Set<string>();
  const limitOptions: Record<string, { readonly key: keyof OperationalLimits; readonly allowsZero: boolean }> = {
    "--max-input-bytes": { key: "maxInputBytes", allowsZero: false },
    "--max-rows": { key: "maxRows", allowsZero: false },
    "--max-field-length": { key: "maxFieldLength", allowsZero: false },
    "--max-diagnostics": { key: "maxDiagnostics", allowsZero: false },
    "--busy-timeout-ms": { key: "busyTimeoutMs", allowsZero: true },
  };
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === "--help" || argument === "-h") { process.stdout.write(HELP); process.exit(0); }
    if (argument === "--dry-run") { if (dryRun) commandError("--dry-run was supplied more than once"); dryRun = true; continue; }
    if (argument === "--debug") { debug = true; continue; }
    const limitOption = limitOptions[argument];
    if (limitOption !== undefined) {
      if (suppliedLimits.has(argument)) commandError(`${argument} was supplied more than once`);
      const value = args[++i]; if (value === undefined || value.startsWith("--")) commandError(`${argument} requires a value`);
      limitOverrides[limitOption.key] = parseLimit(argument, value, limitOption.allowsZero); suppliedLimits.add(argument); continue;
    }
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
  return { input: resolve(input), database: resolve(database), dryRun, format, debug, limits: withOperationalLimits(limitOverrides) };
}
function expected(options: Options, runId: string, code: string, message: string, exitCode: number): void {
  if (options.format === "json") process.stdout.write(renderJson({ schemaVersion: 1, runId, error: { code, message }, dryRun: options.dryRun }));
  else process.stderr.write(`${code}: ${message}\n`);
  process.exitCode = exitCode;
}
async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2)); const runId = randomUUID();
  let bytes: string;
  try { [bytes] = await Promise.all([readInput(options.input, options.limits), verifyDatabasePath(options.database)]); }
  catch (error) {
    if (error instanceof InputReadError) expected(options, runId, error.code, error.message, 2);
    else expected(options, runId, "unreadable_path", "input or database path is unreadable", 2);
    return;
  }
  try { verifyDatabase(options.database); } catch { expected(options, runId, "database_failure", "database could not be opened", 4); return; }
  const validation = parseAndValidateInput(bytes, options.limits);
  if (!validation.ok) { if (options.format === "json") expected(options, runId, validation.error.diagnostics[0]?.code ?? "invalid_input", "input validation failed", 2); else { process.stderr.write(renderDiagnostics(validation.error.diagnostics, validation.error.diagnosticsTruncated)); process.exitCode = 2; } return; }
  try {
    const summary = consolidate(validation.value, options.database, options.dryRun, runId, options.limits);
    process.stdout.write(options.format === "json" ? renderJson(summary) : renderText(summary));
  } catch (error) {
    const sqliteCode = typeof error === "object" && error !== null && "code" in error ? (error as { code?: unknown }).code : undefined;
    const busy = sqliteCode === "ERR_SQLITE_BUSY" || sqliteCode === "SQLITE_BUSY" || (error instanceof Error && /database is locked|database table is locked/i.test(error.message));
    const code = error instanceof ConsolidationError ? error.code : error instanceof CatalogMigrationError && /newer than supported/.test(error.message) ? "unsupported_schema_version" : busy ? "database_busy" : error instanceof CatalogMigrationError ? "migration_failure" : "database_failure";
    const status = error instanceof ConsolidationError && error.code === "identity_ambiguity" ? 3 : 4;
    expected(options, runId, code, error instanceof Error ? error.message : "database operation failed", status);
    if (options.debug && error instanceof Error && error.stack) process.stderr.write(`${error.stack}\n`);
  }
}
void main().catch((error: unknown) => { process.stderr.write(error instanceof Error ? `${error.message}\n` : "unexpected failure\n"); process.exitCode = 1; });
