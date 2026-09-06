import { createHash } from "node:crypto";
import aliasData from "./product-aliases.json" with { type: "json" };

export const CANONICALIZATION_VERSION = aliasData.version;

export type IdentityField = "name" | "brand" | "category";

export interface ProductAttributes {
  readonly name: string;
  readonly brand: string | null;
  readonly category: string;
}

export interface CanonicalProductIdentity {
  readonly name: string;
  readonly brand: string;
  readonly category: string;
  readonly fingerprint: string;
  readonly normalizationVersion: number;
  readonly rulesUsed: readonly string[];
}

export interface ExistingProduct extends ProductAttributes {
  readonly id: number;
}

export type ProductResolution =
  | { readonly kind: "matched"; readonly productId: number; readonly identity: CanonicalProductIdentity }
  | { readonly kind: "new"; readonly identity: CanonicalProductIdentity }
  | { readonly kind: "ambiguous"; readonly candidateProductIds: readonly number[]; readonly reason: "canonical_fingerprint_collision"; readonly identity: CanonicalProductIdentity };

interface AliasRule {
  readonly field: IdentityField;
  readonly from: string;
  readonly to: string;
}

function normalizeBase(value: string | null): string {
  if (value === null) return "";
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[\u0027\u0022\u0060\u00b4\u2018\u2019\u201b\u201c\u201d\u201f]/gu, "")
    .replace(/\p{P}/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function checkedAliases(rules: readonly AliasRule[]): ReadonlyMap<string, string> {
  const aliases = new Map<string, string>();
  for (const rule of rules) {
    const from = normalizeBase(rule.from);
    const to = normalizeBase(rule.to);
    if (!from || !to || from !== rule.from || to !== rule.to) {
      throw new Error("identity aliases must be non-empty canonical phrases");
    }
    const key = `${rule.field}\u0000${from}`;
    const existing = aliases.get(key);
    if (existing !== undefined && existing !== to) {
      throw new Error(`identity alias collision for ${rule.field}: ${from}`);
    }
    aliases.set(key, to);
  }
  return aliases;
}

const aliases = checkedAliases(aliasData.aliases as readonly AliasRule[]);

/** Validates an alias set for data-review and collision tests. */
export function validateAliasRules(rules: readonly AliasRule[]): void {
  checkedAliases(rules);
}

export function canonicalizeField(field: IdentityField, value: string | null): { readonly value: string; readonly aliasUsed?: string } {
  const normalized = normalizeBase(value);
  const replacement = aliases.get(`${field}\u0000${normalized}`);
  return replacement === undefined ? { value: normalized } : { value: replacement, aliasUsed: `${field}:${normalized}->${replacement}` };
}

export function canonicalizeProduct(attributes: ProductAttributes): CanonicalProductIdentity {
  const name = canonicalizeField("name", attributes.name);
  const brand = canonicalizeField("brand", attributes.brand);
  const category = canonicalizeField("category", attributes.category);
  const components = [name.value, brand.value, category.value];
  const rulesUsed = ["unicode-nfd-remove-marks", "unicode-lowercase", "quotes-removed", "punctuation-to-space", "whitespace-collapsed"];
  for (const component of [name, brand, category]) if (component.aliasUsed !== undefined) rulesUsed.push(component.aliasUsed);
  return {
    name: name.value,
    brand: brand.value,
    category: category.value,
    fingerprint: createHash("sha256").update(JSON.stringify([CANONICALIZATION_VERSION, components])).digest("hex"),
    normalizationVersion: CANONICALIZATION_VERSION,
    rulesUsed,
  };
}

/** Resolves against the caller-provided exact-fingerprint candidate set only. */
export function resolveProduct(attributes: ProductAttributes, candidates: readonly ExistingProduct[]): ProductResolution {
  const identity = canonicalizeProduct(attributes);
  const matchingIds = candidates
    .filter((candidate) => canonicalizeProduct(candidate).fingerprint === identity.fingerprint)
    .map((candidate) => candidate.id)
    .sort((left, right) => left - right);
  if (matchingIds.length === 0) return { kind: "new", identity };
  if (matchingIds.length === 1) return { kind: "matched", productId: matchingIds[0]!, identity };
  return { kind: "ambiguous", candidateProductIds: matchingIds, reason: "canonical_fingerprint_collision", identity };
}
