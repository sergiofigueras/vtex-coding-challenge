import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseAndValidateInput } from "../src/domain/input.ts";

test("private ProductEntry snapshot validates under the public input contract", async () => {
  const bytes = await readFile(".sdd/inputs/ProductEntry.json", "utf8");
  const result = parseAndValidateInput(bytes);
  assert.equal(result.ok, true, result.ok ? undefined : JSON.stringify(result.error));
  if (result.ok) {
    assert.equal(result.value.inputRowCount, 269);
    assert.equal(result.value.distinctSellerEntryCount, 268);
  }
});
