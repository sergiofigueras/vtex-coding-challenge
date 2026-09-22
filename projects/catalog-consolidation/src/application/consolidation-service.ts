import type {
  CatalogRepository,
  ConsolidationSummary,
  ProductResolver,
  ValidatedInput,
} from '../domain/contracts.js';

export class ConsolidationService {
  constructor(
    private readonly repository: CatalogRepository,
    private readonly resolver: ProductResolver,
  ) {}

  plan(
    entries: ValidatedInput,
    options: {
      readonly dryRun: boolean;
      readonly databasePath: string;
      readonly elapsedMilliseconds: number;
      readonly runId: string;
      readonly verboseLocal: boolean;
    },
  ): ConsolidationSummary {
    const counts = this.repository.consolidate !== undefined
      ? this.repository.consolidate(entries, this.resolver, options.dryRun)
      : this.repository.withPlanningTransaction((catalog) => this.resolver.plan(entries, catalog?.listProductCandidates() ?? []));
    return {
      version: '1',
      status: 'success',
      runId: options.runId,
      normalizationVersion: 1,
      schemaVersion: 1,
      ...counts,
      elapsedMilliseconds: options.elapsedMilliseconds,
      dryRun: options.dryRun,
      databasePath: options.verboseLocal ? options.databasePath : '<redacted>',
    };
  }
}
