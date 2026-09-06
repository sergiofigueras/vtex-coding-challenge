#!/usr/bin/env node
import { resolve } from "node:path";
import { planConsolidation } from "./application/consolidation.ts";
import { readInput } from "./adapters/fs-input.ts";
import { renderDiagnostics, renderJson, renderText } from "./adapters/reporter.ts";
import { verifyDatabase, verifyDatabasePath } from "./adapters/sqlite-catalog.ts";
import { parseAndValidateInput } from "./domain/input.ts";

type Format = "text" | "json";
type Options = { input: string; database: string; dryRun: boolean; format: Format };

const HELP = `Usage: catalog-consolidate --input <products.json> --database <catalog.db> [--dry-run] [--format text|json]\n`;

function commandError(message: string): never {
  process.stderr.write(`${message}\n${HELP}`);
  process.exit(2);
}

function parseArgs(args: readonly string[]): Options {
  let input: string | undefined;
  let database: string | undefined;
  let dryRun = false;
  let format: Format = "text";
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (argument === "--help" || argument === "-h") {
      process.stdout.write(HELP);
      process.exit(0);
    }
    if (argument === "--dry-run") {
      if (dryRun) commandError("--dry-run was supplied more than once");
      dryRun = true;
      continue;
    }
    if (argument === "--input" || argument === "--database" || argument === "--format") {
      const value = args[++i];
      if (value === undefined || value.startsWith("--")) commandError(`${argument} requires a value`);
      if (argument === "--input") {
        if (input !== undefined) commandError("--input was supplied more than once");
        input = value;
      } else if (argument === "--database") {
        if (database !== undefined) commandError("--database was supplied more than once");
        database = value;
      } else if (value === "text" || value === "json") format = value;
      else commandError("--format must be text or json");
      continue;
    }
    commandError(`unknown argument: ${argument}`);
  }
  if (input === undefined) commandError("--input is required");
  if (database === undefined) commandError("--database is required");
  return { input: resolve(input), database: resolve(database), dryRun, format };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  let bytes: string;
  try {
    [bytes] = await Promise.all([readInput(options.input), verifyDatabasePath(options.database)]);
  } catch {
    process.stderr.write("input or database path is unreadable\n");
    process.exitCode = 2;
    return;
  }
  try {
    verifyDatabase(options.database);
  } catch {
    process.stderr.write("database operation failed\n");
    process.exitCode = 4;
    return;
  }
  const started = performance.now();
  const validation = parseAndValidateInput(bytes);
  if (!validation.ok) {
    process.stderr.write(renderDiagnostics(validation.error.diagnostics, validation.error.diagnosticsTruncated));
    process.exitCode = 2;
    return;
  }
  const summary = planConsolidation(validation.value, options.database, options.dryRun, Math.round(performance.now() - started));
  process.stdout.write(options.format === "json" ? renderJson(summary) : renderText(summary));
}

void main().catch(() => {
  process.stderr.write("database operation failed\n");
  process.exitCode = 4;
});
