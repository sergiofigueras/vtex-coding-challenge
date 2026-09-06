import assert from "node:assert/strict";
import test from "node:test";
import { ConsolidationService, type CatalogRepository, type CatalogTransaction } from "../src/application/consolidation.ts";
import type { SellerEntry, ValidatedInput } from "../src/domain/input.ts";
import { canonicalizeProduct } from "../src/domain/product-identity.ts";

class MemoryTransaction implements CatalogTransaction {
  readonly products = new Map<number, SellerEntry>();
  readonly identities = new Map<string, number>();
  readonly links = new Map<string, number>();
  nextId = 1;
  migrate(): void { /* migration is an adapter concern in this memory test */ }
  findProductIds(fingerprint: string): readonly number[] { const id = this.identities.get(fingerprint); return id === undefined ? [] : [id]; }
  insertProduct(entry: SellerEntry): number { const id = this.nextId++; this.products.set(id, entry); return id; }
  insertIdentity(productId: number, identity: ReturnType<typeof canonicalizeProduct>): void { this.identities.set(identity.fingerprint, productId); }
  findSellerLink(seller: string, id: string): number | undefined { return this.links.get(`${seller}\u0000${id}`); }
  insertSellerLink(seller: string, productId: number, id: string): void { this.links.set(`${seller}\u0000${id}`, productId); }
  assertForeignKeysClean(): void { /* all memory references are inserted products */ }
}
class MemoryRepository implements CatalogRepository {
  readonly transaction = new MemoryTransaction();
  transact(_dryRun: boolean, work: (transaction: CatalogTransaction) => void): void { work(this.transaction); }
}
function input(entries: readonly SellerEntry[]): ValidatedInput { return { entries, inputRowCount: entries.length, distinctSellerEntryCount: entries.length, duplicateInputCount: 0 }; }

test("adapter-independent service orders work deterministically and reports elapsed time from its clock", () => {
  const repository = new MemoryRepository();
  let tick = 10;
  const service = new ConsolidationService(repository, () => tick);
  const summary = service.consolidate(input([
    { Id: "z", SellerName: "seller", Name: "second", Brand: null, Category: "tools" },
    { Id: "a", SellerName: "seller", Name: "first", Brand: null, Category: "tools" },
  ]), false, "run");
  assert.equal(summary.insertedProducts, 2);
  assert.equal(summary.elapsedMilliseconds, 0);
  tick = 35;
  const rerun = service.consolidate(input([{ Id: "a", SellerName: "seller", Name: "first", Brand: null, Category: "tools" }]), false, "rerun");
  assert.equal(rerun.alreadyPresentLinks, 1);
  assert.equal(rerun.elapsedMilliseconds, 0);
  assert.deepEqual([...repository.transaction.links.keys()], ["seller\u0000a", "seller\u0000z"]);
});

test("elapsed time is measured after the transaction completes", () => {
  const repository = new MemoryRepository();
  const clock = [100, 137];
  const summary = new ConsolidationService(repository, () => clock.shift()!).consolidate(input([]), false, "run");
  assert.equal(summary.elapsedMilliseconds, 37);
});

test("opaque control text cannot make ordering depend on input order", () => {
  const entries: SellerEntry[] = [
    { Id: "c", SellerName: "a\u0000b", Name: "Café", Brand: null, Category: "tools" },
    { Id: "b\u0000c", SellerName: "a", Name: "cafe", Brand: null, Category: "tools" },
  ];
  const firstRepository = new MemoryRepository();
  const secondRepository = new MemoryRepository();
  new ConsolidationService(firstRepository).consolidate(input(entries), false, "first");
  new ConsolidationService(secondRepository).consolidate(input([...entries].reverse()), false, "second");
  assert.deepEqual([...firstRepository.transaction.products.values()], [...secondRepository.transaction.products.values()]);
  assert.equal([...firstRepository.transaction.products.values()][0]?.Name, "cafe");
});
