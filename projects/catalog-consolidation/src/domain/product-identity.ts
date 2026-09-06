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
  const wholeFieldReplacement = aliases.get(`${field}\u0000${normalized}`);
  if (wholeFieldReplacement !== undefined) {
    return { value: wholeFieldReplacement, aliasUsed: `${field}:${normalized}->${wholeFieldReplacement}` };
  }

  const fieldAliases = [...aliases]
    .filter(([key]) => key.startsWith(`${field}\u0000`))
    .map(([key, replacement]) => ({ from: key.slice(field.length + 1).split(" "), replacement }))
    .sort((left, right) => right.from.length - left.from.length || (left.from.join(" ") < right.from.join(" ") ? -1 : left.from.join(" ") > right.from.join(" ") ? 1 : 0));
  const tokens = normalized === "" ? [] : normalized.split(" ");
  const used: string[] = [];
  const output: string[] = [];
  for (let index = 0; index < tokens.length;) {
    const alias = fieldAliases.find(({ from }) => from.every((token, offset) => tokens[index + offset] === token));
    if (alias === undefined) {
      output.push(tokens[index]!);
      index++;
    } else {
      output.push(alias.replacement);
      used.push(`${field}:${alias.from.join(" ")}->${alias.replacement}`);
      index += alias.from.length;
    }
  }
  return used.length === 0 ? { value: normalized } : { value: output.join(" "), aliasUsed: used.join(",") };
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
