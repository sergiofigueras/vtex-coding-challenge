export interface OperationalLimits {
  readonly maxInputBytes: number;
  readonly maxRows: number;
  readonly maxFieldLength: number;
  readonly maxDiagnostics: number;
  readonly busyTimeoutMs: number;
}

/** Immutable default limits for the in-memory catalog consolidation runtime. */
export const DEFAULT_OPERATIONAL_LIMITS: OperationalLimits = Object.freeze({
  maxInputBytes: 256 * 1024 * 1024,
  maxRows: 1_000_000,
  maxFieldLength: 16_384,
  maxDiagnostics: 100,
  busyTimeoutMs: 30_000,
});

export type OperationalLimitName = keyof OperationalLimits;

export class OperationalLimitsError extends Error {
  override name = "OperationalLimitsError";
}

const LIMIT_RULES: Readonly<Record<OperationalLimitName, { readonly allowsZero: boolean }>> = Object.freeze({
  maxInputBytes: { allowsZero: false },
  maxRows: { allowsZero: false },
  maxFieldLength: { allowsZero: false },
  maxDiagnostics: { allowsZero: false },
  busyTimeoutMs: { allowsZero: true },
});

/**
 * Resolves a complete immutable policy and rejects invalid programmatic values.
 * Adapters call this at their boundary so a structurally forged TypeScript value
 * cannot reach filesystem or SQLite configuration.
 */
export function withOperationalLimits(overrides: Partial<OperationalLimits> = {}): OperationalLimits {
  for (const key of Object.keys(overrides)) {
    if (!(key in LIMIT_RULES)) throw new OperationalLimitsError(`unknown operational limit: ${key}`);
  }
  const limits = { ...DEFAULT_OPERATIONAL_LIMITS, ...overrides };
  for (const key of Object.keys(LIMIT_RULES) as OperationalLimitName[]) {
    const value = limits[key];
    const { allowsZero } = LIMIT_RULES[key];
    if (!Number.isSafeInteger(value) || value < 0 || (!allowsZero && value === 0)) {
      throw new OperationalLimitsError(`${key} must be a ${allowsZero ? "non-negative" : "positive"} safe integer`);
    }
  }
  return Object.freeze(limits);
}
