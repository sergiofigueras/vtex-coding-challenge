import type { RowDiagnostic, ValidationFailure } from "../domain/input.ts";
import type { ConsolidationSummary } from "../application/consolidation.ts";

type ErrorEnvelope = { readonly schemaVersion: 1; readonly runId: string; readonly error: { readonly code: string; readonly message: string }; readonly dryRun: boolean };
export function renderJson(value: ConsolidationSummary | ValidationFailure | ErrorEnvelope): string { return `${JSON.stringify(value)}\n`; }
export function renderText(summary: ConsolidationSummary): string { return `catalog consolidation: ${summary.distinctSellerEntryCount} entries; ${summary.insertedProducts} products and ${summary.insertedLinks} links inserted${summary.dryRun ? " (dry run)" : ""}\n`; }
export function renderDiagnostics(diagnostics: readonly RowDiagnostic[], truncated: boolean): string {
  const rows = diagnostics.map((item) => `${item.index === 0 ? "input" : `row ${item.index}`}: ${item.code}: ${item.message}`);
  if (truncated) rows.push("diagnostics truncated"); return `${rows.join("\n")}\n`;
}
