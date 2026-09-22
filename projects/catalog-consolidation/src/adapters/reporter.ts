import type { ConsolidationSummary, OutputFormat, Reporter } from '../domain/contracts.js';

export class SummaryReporter implements Reporter {
  render(summary: ConsolidationSummary, format: OutputFormat): string {
    if (format === 'json') {
      return `${JSON.stringify(summary)}\n`;
    }
    return [
      `Catalog consolidation ${summary.dryRun ? 'plan' : 'completed'}.`,
      `Rows: ${summary.inputRows}; distinct seller entries: ${summary.distinctSellerEntries}.`,
      `Matched: ${summary.matchedProducts}; inserts planned: ${summary.insertedProducts}; links planned: ${summary.insertedLinks}.`,
      `Rejected: ${summary.rejectedRows}; ambiguous: ${summary.ambiguousRows}.`,
    ].join('\n').concat('\n');
  }
}
