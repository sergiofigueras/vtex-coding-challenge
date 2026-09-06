import assert from "node:assert/strict";
import test from "node:test";
import { CANONICALIZATION_VERSION, canonicalizeProduct, resolveProduct, validateAliasRules } from "../src/domain/product-identity.ts";

const product = (overrides: Partial<{ id: number; name: string; brand: string | null; category: string }> = {}) => ({
  id: 7,
  name: "Café Grinder",
  brand: "Maker",
  category: "Kitchen Tools",
  ...overrides,
});

test("canonicalization has deterministic locale-independent golden identities", () => {
  const expected = canonicalizeProduct(product());
  assert.deepEqual(expected, {
    name: "cafe grinder",
    brand: "maker",
    category: "kitchen tools",
    fingerprint: "13cc4d5aeab2195171f9bf8d54bd6a6ead0cf952cf2697f3a95623492b3ec35e",
    normalizationVersion: CANONICALIZATION_VERSION,
    rulesUsed: ["unicode-nfd-remove-marks", "unicode-lowercase", "quotes-removed", "punctuation-to-space", "whitespace-collapsed"],
  });
  assert.deepEqual(canonicalizeProduct(product({ name: " CAFÉ—GRINDER ", brand: "\u201cMaker\u201d", category: "Kitchen, Tools" })), expected);
  const aliased = canonicalizeProduct(product({ name: "roteador", brand: null, category: "photo" }));
  const canonical = canonicalizeProduct(product({ name: "router", brand: null, category: "photography" }));
  assert.deepEqual({ name: aliased.name, brand: aliased.brand, category: aliased.category, fingerprint: aliased.fingerprint }, { name: canonical.name, brand: canonical.brand, category: canonical.category, fingerprint: canonical.fingerprint });
});

test("resolution matches canonical variants, preserves new display values, and exposes rules", () => {
  const incoming = product({ name: "processador", brand: "Acme", category: "photo" });
  const existing = product({ id: 42, name: "Processor", brand: "ACME", category: "Photography" });
  const result = resolveProduct(incoming, [existing]);
  assert.equal(result.kind, "matched");
  if (result.kind === "matched") {
    assert.equal(result.productId, 42);
    assert.deepEqual(result.identity.rulesUsed.slice(-2), ["name:processador->processor", "category:photo->photography"]);
  }

  const hostile = product({ name: "New product", brand: "x'); DROP TABLE Product; --", category: "tools" });
  const newResult = resolveProduct(hostile, [existing]);
  assert.equal(newResult.kind, "new");
  assert.equal(hostile.brand, "x'); DROP TABLE Product; --");
});

test("canonical collisions are explicit and candidate IDs are stable", () => {
  const result = resolveProduct(product(), [product({ id: 9 }), product({ id: 2, name: "cafe grinder", brand: "maker", category: "kitchen tools" })]);
  assert.deepEqual(result.kind === "ambiguous" ? { kind: result.kind, candidateProductIds: result.candidateProductIds, reason: result.reason } : result, {
    kind: "ambiguous",
    candidateProductIds: [2, 9],
    reason: "canonical_fingerprint_collision",
  });
});

test("aliases are canonical, field-specific, and collision-checked", () => {
  assert.throws(() => validateAliasRules([
    { field: "name", from: "widget", to: "thing" },
    { field: "name", from: "widget", to: "gadget" },
  ]), /identity alias collision/);
  assert.doesNotThrow(() => validateAliasRules([
    { field: "name", from: "photo", to: "camera" },
    { field: "category", from: "photo", to: "photography" },
  ]));
  assert.throws(() => validateAliasRules([{ field: "name", from: "Roteador", to: "router" }]), /canonical phrases/);
});
