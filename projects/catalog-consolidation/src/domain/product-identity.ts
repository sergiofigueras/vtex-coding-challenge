import { PRODUCT_IDENTITY_ALIASES, PRODUCT_IDENTITY_ALIAS_VERSION } from './product-identity-aliases.js';

export const PRODUCT_IDENTITY_NORMALIZATION_VERSION = 1;
export const MAX_IDENTITY_CANDIDATES = 20;

export type IdentityField = 'name' | 'brand' | 'category';

export interface ProductIdentityInput {
  readonly name: string;
  readonly brand: string | null;
  readonly category: string;
}

export interface CanonicalProductIdentity {
  readonly version: number;
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly fingerprint: string;
  readonly rulesUsed: readonly string[];
}

export interface IdentityCatalogProduct extends ProductIdentityInput {
  readonly id: number;
}

export type Resolution =
  | {
      readonly kind: 'matched';
      readonly productId: number;
      readonly identity: CanonicalProductIdentity;
    }
  | {
      readonly kind: 'new';
      readonly identity: CanonicalProductIdentity;
    }
  | {
      readonly kind: 'ambiguous';
      readonly reason: 'fingerprint_collision' | 'potential_duplicate';
      readonly identity: CanonicalProductIdentity;
      readonly candidateIds: readonly string[];
    };

type AliasMap = Readonly<Record<string, string>>;

function normalizeBase(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // Quotes do not create a word boundary (e.g. O'Reilly -> oreilly).
    .replace(/[\u0022\u0027\u0060\u00ab\u00bb\u2018-\u201f\u2032\u2033]/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/gu, ' ');
}

function aliasFor(field: IdentityField): AliasMap {
  return PRODUCT_IDENTITY_ALIASES[field];
}

/** Pure, locale-independent, versioned canonicalization for comparison only. */
export function canonicalizeField(value: string | null, field: IdentityField): { readonly value: string; readonly rules: readonly string[] } {
  const normalized = normalizeBase(value ?? '');
  if (normalized === '') return { value: normalized, rules: [] };

  // Compare whole normalized tokens, never substrings inside a model name.
  // Longer reviewed phrases take precedence over their component aliases.
  const aliases = Object.entries(aliasFor(field))
    .map(([source, replacement]) => ({ source, sourceTokens: source.split(' '), replacementTokens: replacement.split(' ') }))
    .sort((left, right) => right.sourceTokens.length - left.sourceTokens.length
      || (left.source < right.source ? -1 : left.source > right.source ? 1 : 0));
  const tokens = normalized.split(' ');
  const result: string[] = [];
  const rules = new Set<string>();

  for (let index = 0; index < tokens.length;) {
    const match = aliases.find((alias) => alias.sourceTokens.every((token, offset) => tokens[index + offset] === token));
    if (match === undefined) {
      const token = tokens[index];
      if (token !== undefined) result.push(token);
      index += 1;
      continue;
    }
    result.push(...match.replacementTokens);
    rules.add(`alias:${field}:${match.source}->${match.replacementTokens.join(' ')}`);
    index += match.sourceTokens.length;
  }

  return { value: result.join(' '), rules: [...rules] };
}

export function canonicalizeProduct(input: ProductIdentityInput): CanonicalProductIdentity {
  const name = canonicalizeField(input.name, 'name');
  const brand = canonicalizeField(input.brand, 'brand');
  const category = canonicalizeField(input.category, 'category');
  const rulesUsed = [...name.rules, ...brand.rules, ...category.rules];
  return {
    version: PRODUCT_IDENTITY_NORMALIZATION_VERSION,
    name: name.value,
    brand: brand.value,
    category: category.value,
    fingerprint: `v${PRODUCT_IDENTITY_NORMALIZATION_VERSION}\u0000${name.value}\u0000${brand.value}\u0000${category.value}`,
    rulesUsed,
  };
}

function samePotentialComponent(left: CanonicalProductIdentity, right: CanonicalProductIdentity): boolean {
  return left.name === right.name && (left.brand === right.brand || left.category === right.category);
}

/**
 * Resolves an entry without mutation. Earlier clear new rows are deliberately
 * retained as virtual candidates, so source order cannot hide an ambiguity.
 */
export function resolveProducts(
  entries: readonly ProductIdentityInput[],
  catalog: readonly IdentityCatalogProduct[],
  candidateLimit = MAX_IDENTITY_CANDIDATES,
): readonly Resolution[] {
  const catalogIdentities = catalog.map((product) => ({ product, identity: canonicalizeProduct(product) }));
  const planned: { readonly sequence: number; readonly identity: CanonicalProductIdentity }[] = [];

  return entries.map((entry, index) => {
    const identity = canonicalizeProduct(entry);
    const exact = catalogIdentities.filter((candidate) => candidate.identity.fingerprint === identity.fingerprint);
    if (exact.length === 1) {
      const match = exact[0];
      if (match === undefined) throw new Error('Exact identity resolution invariant failed.');
      return { kind: 'matched', productId: match.product.id, identity };
    }
    if (exact.length > 1) {
      return {
        kind: 'ambiguous',
        reason: 'fingerprint_collision',
        identity,
        candidateIds: exact.slice(0, candidateLimit).map((candidate) => String(candidate.product.id)),
      };
    }

    const potentialCatalog = catalogIdentities
      .filter((candidate) => samePotentialComponent(identity, candidate.identity))
      .map((candidate) => String(candidate.product.id));
    const potentialPlanned = planned
      .filter((candidate) => samePotentialComponent(identity, candidate.identity))
      .map((candidate) => `planned:${candidate.sequence}`);
    const candidates = [...potentialCatalog, ...potentialPlanned];
    if (candidates.length > 0) {
      return { kind: 'ambiguous', reason: 'potential_duplicate', identity, candidateIds: candidates.slice(0, candidateLimit) };
    }

    planned.push({ sequence: index + 1, identity });
    return { kind: 'new', identity };
  });
}

/** Reject alias revisions that would silently collapse distinct prior triples. */
export function assertAliasesDoNotCollide(products: readonly IdentityCatalogProduct[]): void {
  const byFingerprint = new Map<string, Set<string>>();
  for (const product of products) {
    const raw = [normalizeBase(product.name), normalizeBase(product.brand ?? ''), normalizeBase(product.category)].join('\u0000');
    const canonical = canonicalizeProduct(product).fingerprint;
    const rawIdentities = byFingerprint.get(canonical) ?? new Set<string>();
    rawIdentities.add(raw);
    byFingerprint.set(canonical, rawIdentities);
  }
  for (const rawIdentities of byFingerprint.values()) {
    if (rawIdentities.size > 1) {
      throw new Error(`Alias version ${PRODUCT_IDENTITY_ALIAS_VERSION} collapses distinct canonical product identities.`);
    }
  }
}
