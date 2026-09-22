import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { JsonInputReader } from './adapters/json-input-reader.js';
import { DeterministicProductResolver } from './adapters/deterministic-product-resolver.js';
import { SummaryReporter } from './adapters/reporter.js';
import { SqliteCatalogRepository } from './adapters/sqlite-catalog-repository.js';
import { ConsolidationService } from './application/consolidation-service.js';
import {
  IdentityAmbiguityError,
  InputValidationError,
  type ApplicationErrorCode,
  type FailureSummary,
  type OutputFormat,
} from './domain/contracts.js';

const MAX_INPUT_BYTES = 5 * 1024 * 1024;

interface CliOptions {
  readonly inputPath: string;
  readonly databasePath: string;
  readonly dryRun: boolean;
  readonly format: OutputFormat;
  readonly debug: boolean;
  readonly verboseLocal: boolean;
}

class CommandError extends Error {
  constructor(message: string, readonly exitCode: 2 | 3 | 4 = 2) {
    super(message);
  }
}

function usage(): string {
  return 'Usage: catalog-consolidate --input <products.json> --database <catalog.db> [--dry-run] [--format text|json] [--verbose-local] [--debug]\n';
}

function runId(): string {
  return `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requestedFormat(arguments_: readonly string[]): OutputFormat {
  for (let index = 0; index < arguments_.length - 1; index += 1) {
    if (arguments_[index] === '--format' && arguments_[index + 1] === 'json') return 'json';
  }
  return 'text';
}

function formatInputValidationError(error: InputValidationError): string {
  const count = `${error.invalidRowCount} invalid ${error.invalidRowCount === 1 ? 'input' : 'inputs'}`;
  const details = error.diagnostics.map((diagnostic) => {
    const location = diagnostic.sourceIndex === undefined ? '' : `row ${diagnostic.sourceIndex}: `;
    return `${location}${diagnostic.code}: ${diagnostic.message}`;
  });
  if (error.diagnosticsTruncated) details.push('E_DIAGNOSTICS_TRUNCATED: Additional invalid inputs were omitted.');
  return [`Input validation failed (${count}).`, ...details].join('\n');
}

function parseArguments(arguments_: readonly string[]): CliOptions {
  let inputPath: string | undefined;
  let databasePath: string | undefined;
  let dryRun = false;
  let format: OutputFormat = 'text';
  let debug = false;
  let verboseLocal = false;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === '--help' || argument === '-h') throw new CommandError(usage());
    if (argument === '--dry-run') { dryRun = true; continue; }
    if (argument === '--debug') { debug = true; continue; }
    if (argument === '--verbose-local') { verboseLocal = true; continue; }
    if (argument === '--input' || argument === '--database' || argument === '--format') {
      const value = arguments_[index + 1];
      if (value === undefined || value.startsWith('--')) throw new CommandError(`Missing value for ${argument}.\n${usage()}`);
      index += 1;
      if (argument === '--input') inputPath = resolve(process.cwd(), value);
      if (argument === '--database') databasePath = resolve(process.cwd(), value);
      if (argument === '--format') {
        if (value !== 'text' && value !== 'json') throw new CommandError(`Unsupported format.\n${usage()}`);
        format = value;
      }
      continue;
    }
    throw new CommandError(`Unknown option: ${argument}.\n${usage()}`);
  }
  if (inputPath === undefined || databasePath === undefined) throw new CommandError(`Both --input and --database are required.\n${usage()}`);
  return { inputPath, databasePath, dryRun, format, debug, verboseLocal };
}

function verifyFile(path: string, label: string): void {
  try {
    const details = statSync(path);
    if (!details.isFile()) throw new Error('not a file');
    if (label === 'Input' && details.size > MAX_INPUT_BYTES) throw new CommandError(`Input exceeds the ${MAX_INPUT_BYTES} byte limit.`);
  } catch (error) {
    if (error instanceof CommandError) throw error;
    throw new CommandError(`${label} path is missing or unreadable.`);
  }
}

function failureCode(error: unknown): { readonly code: ApplicationErrorCode; readonly exitCode: 1 | 2 | 3 | 4; readonly message: string } {
  if (error instanceof CommandError) return { code: 'E_COMMAND_VALIDATION', exitCode: error.exitCode, message: error.message.trim() };
  if (error instanceof InputValidationError) {
    const code = error.diagnostics.some((diagnostic) => diagnostic.code === 'E_SELLER_ENTRY_CONFLICT') ? 'E_SELLER_ENTRY_CONFLICT' :
      error.diagnostics.some((diagnostic) => diagnostic.code === 'E_JSON_PARSE' || diagnostic.code === 'E_ROOT_TYPE') ? 'E_MALFORMED_INPUT' : 'E_INVALID_ROW';
    return { code, exitCode: 2, message: 'Input validation failed.' };
  }
  if (error instanceof IdentityAmbiguityError) return { code: 'E_IDENTITY_AMBIGUITY', exitCode: 3, message: 'Product identity ambiguity prevented consolidation.' };
  const message = error instanceof Error ? error.message : '';
  if (/Seller link conflict/.test(message)) return { code: 'E_SELLER_LINK_CONFLICT', exitCode: 4, message: 'Seller link conflict prevented consolidation.' };
  if (/newer than supported version/.test(message)) return { code: 'E_UNSUPPORTED_SCHEMA_VERSION', exitCode: 4, message: 'Database schema version is unsupported.' };
  if (/foreign.key|integrity|constraint failed/i.test(message)) return { code: 'E_DATABASE_INTEGRITY', exitCode: 4, message: 'Database integrity validation failed.' };
  if (/busy|locked/i.test(message)) return { code: 'E_DATABASE_BUSY', exitCode: 4, message: 'Database is busy; retry the operation.' };
  if (/migration|schema|backfill/i.test(message)) return { code: 'E_MIGRATION_FAILURE', exitCode: 4, message: 'Database migration failed.' };
  return { code: 'E_UNEXPECTED', exitCode: 1, message: 'Unexpected application failure.' };
}

function renderFailure(error: unknown, format: OutputFormat, id: string, elapsedMilliseconds: number, dryRun: boolean): string {
  const mapped = failureCode(error);
  if (format === 'text') {
    if (error instanceof InputValidationError) return `${formatInputValidationError(error)}\n`;
    return `${mapped.code}: ${mapped.message}\n`;
  }
  const summary: FailureSummary = {
    version: '1', status: 'failure', runId: id, code: mapped.code, message: mapped.message,
    exitCode: mapped.exitCode, elapsedMilliseconds, dryRun,
    ...(error instanceof InputValidationError ? { diagnostics: error.diagnostics, diagnosticsTruncated: error.diagnosticsTruncated } : {}),
  };
  return `${JSON.stringify(summary)}\n`;
}

export function run(arguments_: readonly string[]): { readonly output: string; readonly exitCode: number; readonly debugOutput?: string } {
  const id = runId();
  const started = process.hrtime.bigint();
  let options: CliOptions | undefined;
  try {
    options = parseArguments(arguments_);
    verifyFile(options.inputPath, 'Input');
    verifyFile(options.databasePath, 'Database');
    const entries = new JsonInputReader().read(readFileSync(options.inputPath, 'utf8'));
    const repository = new SqliteCatalogRepository(options.databasePath);
    const summary = new ConsolidationService(repository, new DeterministicProductResolver()).plan(entries, {
      dryRun: options.dryRun,
      databasePath: options.databasePath,
      elapsedMilliseconds: Number((process.hrtime.bigint() - started) / 1_000_000n),
      runId: id,
      verboseLocal: options.verboseLocal,
    });
    return { output: new SummaryReporter().render(summary, options.format), exitCode: 0 };
  } catch (error) {
    const elapsedMilliseconds = Number((process.hrtime.bigint() - started) / 1_000_000n);
    const mapped = failureCode(error);
    const debugOutput = options?.debug && error instanceof Error ? `${error.stack ?? error.message}\n` : undefined;
    return {
      output: renderFailure(error, options?.format ?? requestedFormat(arguments_), id, elapsedMilliseconds, options?.dryRun ?? false),
      exitCode: mapped.exitCode,
      ...(debugOutput === undefined ? {} : { debugOutput }),
    };
  }
}

const result = run(process.argv.slice(2));
if (result.exitCode === 0) process.stdout.write(result.output);
else process.stderr.write(result.output);
if (result.debugOutput !== undefined) process.stderr.write(result.debugOutput);
process.exitCode = result.exitCode;
