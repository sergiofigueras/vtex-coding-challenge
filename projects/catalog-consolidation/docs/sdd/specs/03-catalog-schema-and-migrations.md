# Catalog schema and migrations

Spec ID: `SDD-003`
Status: `ready`
Kind: product specification
Depends on: `SDD-000`, `SDD-001`, `SDD-002`

## Existing schema

The supplied database contains:

```sql
Product(Id INTEGER PRIMARY KEY AUTOINCREMENT, Name TEXT NOT NULL, Brand TEXT, Category TEXT)
SellerProduct(Id INTEGER PRIMARY KEY AUTOINCREMENT, SellerName TEXT NOT NULL, ProductId INTEGER NOT NULL REFERENCES Product(Id), SellerProductId INTEGER NOT NULL)
```

The declared integer affinity for `SellerProductId` cannot represent the supplied identifier contract faithfully. The database also lacks relationship uniqueness and product-resolution support.

## Migration decision

Use `PRAGMA user_version` and ordered, idempotent migrations. Version 1 must:

1. Rebuild `SellerProduct` so `SellerProductId` is `TEXT NOT NULL`.
2. Preserve any pre-existing rows losslessly using `CAST(SellerProductId AS TEXT)`.
3. Keep the foreign key to `Product(Id)` and enable `PRAGMA foreign_keys = ON` on every connection.
4. Add `UNIQUE(SellerName, SellerProductId)` for seller-scoped idempotency.
5. Add an index on `SellerProduct(ProductId)`.
6. Add a separate `ProductIdentity` table keyed by `ProductId`, containing the versioned canonical name, brand, category, and a unique canonical fingerprint. Do not overwrite the source-facing fields in `Product`.

`ProductIdentity.ProductId` is one-to-one with `Product(Id)` and cascades on delete. Backfill all existing products before importing seller links. If two existing products collapse to the same fingerprint, abort migration with an explicit collision report; do not merge historical rows automatically.

## Safety and compatibility

- Run migrations and consolidation under one `BEGIN IMMEDIATE` transaction for the exercise's single-writer assumption.
- Create replacement tables, copy, validate counts and foreign keys, then swap names. Never rely on SQLite accepting text in an INTEGER-affinity column.
- Reject database schemas newer than the application understands.
- Database failures roll back the full migration and batch.

## Acceptance criteria

- **AC-003-01:** A pristine fixture migrates to the declared schema with all 975 products preserved and foreign-key checks clean.
- **AC-003-02:** Re-running migration is a no-op, and an unknown future `user_version` fails without mutation.
- **AC-003-03:** Pre-existing numeric seller product IDs become equivalent text values, while arbitrary incoming string IDs round-trip losslessly.
- **AC-003-04:** A backfill fingerprint collision aborts and restores the exact pre-migration database state.

## Proof

Use temporary database copies. Assert table SQL, indexes, user version, row counts, `PRAGMA foreign_key_check`, rollback byte/state behavior, and repeated migration.

## Cost checkpoint

Migration implementation may use the Terra route. Schema verification is deterministic and must not call a model.
