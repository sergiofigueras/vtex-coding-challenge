import assert from "node:assert/strict";
import test from "node:test";
import { MAX_DIAGNOSTICS, MAX_FIELD_LENGTH, parseAndValidateInput } from "../src/domain/input.ts";

const entry = (overrides: Record<string, unknown> = {}) => ({ Id: "opaque-7", SellerName: "seller", Name: "Café; DROP", Brand: null, Category: "tools", ...overrides });

test("accepts nullable brands, opaque IDs, Unicode, and control-looking input as data", () => {
  const input = [entry({ Id: "not-a-uuid; --", Brand: "x'); /* \u0000 Ω" })];
  const result = parseAndValidateInput(JSON.stringify(input));
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.value.entries[0], input[0]);
});

test("deduplicates exact seller entries but permits an ID at another seller", () => {
  const result = parseAndValidateInput(JSON.stringify([entry(), entry(), entry({ SellerName: "other" })]));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.distinctSellerEntryCount, 2);
    assert.equal(result.value.duplicateInputCount, 1);
  }
});

test("rejects seller-entry conflicts as an invalid batch", () => {
  const result = parseAndValidateInput(JSON.stringify([entry(), entry({ Name: "different" })]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.error.diagnostics, [{ index: 2, code: "seller_entry_conflict", message: "seller entry conflicts with an earlier row" }]);
});

test("reports stable one-based bounded diagnostics", () => {
  const input = Array.from({ length: MAX_DIAGNOSTICS + 3 }, () => entry({ Name: " " }));
  const result = parseAndValidateInput(JSON.stringify(input));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.invalidCount, MAX_DIAGNOSTICS + 3);
    assert.equal(result.error.diagnostics.length, MAX_DIAGNOSTICS);
    assert.equal(result.error.diagnostics[0]?.index, 1);
    assert.equal(result.error.diagnosticsTruncated, true);
  }
});

test("rejects malformed roots, closed-object violations, and length violations", () => {
  for (const value of ["{", "{}", JSON.stringify([entry({ extra: true })]), JSON.stringify([entry({ Name: "x".repeat(MAX_FIELD_LENGTH + 1) })])]) {
    assert.equal(parseAndValidateInput(value).ok, false);
  }
});
