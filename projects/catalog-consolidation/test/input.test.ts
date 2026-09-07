import assert from "node:assert/strict";
import test from "node:test";
import { parseAndValidateInput } from "../src/domain/input.ts";
import { readInput } from "../src/adapters/fs-input.ts";
import { SqliteCatalogRepository } from "../src/adapters/sqlite-catalog.ts";
import { DEFAULT_OPERATIONAL_LIMITS, OperationalLimitsError, withOperationalLimits } from "../src/domain/operational-limits.ts";

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

test("treats opaque seller and identifier control text as separate tuple fields", () => {
  const result = parseAndValidateInput(JSON.stringify([
    entry({ SellerName: "a\u0000b", Id: "c", Name: "first" }),
    entry({ SellerName: "a", Id: "b\u0000c", Name: "second" }),
  ]));
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.value.distinctSellerEntryCount, 2);
});

test("rejects seller-entry conflicts as an invalid batch", () => {
  const result = parseAndValidateInput(JSON.stringify([entry(), entry({ Name: "different" })]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.error.diagnostics, [{ index: 2, code: "seller_entry_conflict", message: "seller entry conflicts with an earlier row" }]);
});

test("reports stable one-based bounded diagnostics", () => {
  const limits = withOperationalLimits({ maxDiagnostics: 2 });
  const input = Array.from({ length: limits.maxDiagnostics + 3 }, () => entry({ Name: " " }));
  const result = parseAndValidateInput(JSON.stringify(input), limits);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.invalidCount, limits.maxDiagnostics + 3);
    assert.equal(result.error.diagnostics.length, limits.maxDiagnostics);
    assert.equal(result.error.diagnostics[0]?.index, 1);
    assert.equal(result.error.diagnosticsTruncated, true);
  }
});

test("deduplicates canonical-equivalent repeated entries with a stable display representative", () => {
  const result = parseAndValidateInput(JSON.stringify([entry({ Name: "cafe" }), entry({ Name: "Café" })]));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.duplicateInputCount, 1);
    assert.equal(result.value.entries[0]?.Name, "Café");
  }
});

test("rejects repeated seller entries that have different canonical product attributes", () => {
  const result = parseAndValidateInput(JSON.stringify([entry({ Name: "Café" }), entry({ Name: "tea" })]));
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.diagnostics[0]?.code, "seller_entry_conflict");
});

test("injects row and field limits without large fixtures", () => {
  const limits = withOperationalLimits({ maxRows: 2, maxFieldLength: 3 });
  const rows = parseAndValidateInput(JSON.stringify(Array.from({ length: limits.maxRows + 1 }, entry)), limits);
  assert.equal(rows.ok, false);
  if (!rows.ok) assert.deepEqual(rows.error.diagnostics, [{ index: 0, code: "row_limit_exceeded", message: "input exceeds 2 rows" }]);
  assert.equal(parseAndValidateInput(JSON.stringify([entry({ Name: "four" })]), limits).ok, false);
});

test("has immutable large operational defaults and rejects invalid programmatic policies before I/O", async () => {
  assert.deepEqual(DEFAULT_OPERATIONAL_LIMITS, { maxInputBytes: 268_435_456, maxRows: 1_000_000, maxFieldLength: 16_384, maxDiagnostics: 100, busyTimeoutMs: 30_000 });
  assert.equal(Object.isFrozen(DEFAULT_OPERATIONAL_LIMITS), true);
  for (const overrides of [
    { maxInputBytes: 0 }, { maxRows: -1 }, { maxFieldLength: 1.5 }, { maxDiagnostics: Number.MAX_SAFE_INTEGER + 1 }, { busyTimeoutMs: -1 },
  ]) assert.throws(() => withOperationalLimits(overrides), OperationalLimitsError);

  const forged = { ...DEFAULT_OPERATIONAL_LIMITS, busyTimeoutMs: -1 };
  assert.throws(() => parseAndValidateInput("[]", forged), OperationalLimitsError);
  assert.throws(() => new SqliteCatalogRepository("/path/that-must-not-be-opened", forged), OperationalLimitsError);
  await assert.rejects(() => readInput("/path/that-must-not-be-opened", forged), OperationalLimitsError);
});

test("rejects malformed roots and closed-object violations", () => {
  for (const value of ["{", "{}", JSON.stringify([entry({ extra: true })])]) assert.equal(parseAndValidateInput(value).ok, false);
});
