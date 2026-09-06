import assert from 'node:assert/strict'
import test from 'node:test'
import { profileJson } from '../scripts/ingest-sources.mjs'

test('profiles source shape and seller-scoped duplicate IDs without retaining row values', () => {
  const profile = profileJson([
    { Id: 'same', SellerName: 'A', Name: 'One', Brand: null, Category: 'C' },
    { Id: 'same', SellerName: 'B', Name: 'One', Brand: 'B', Category: 'C' },
    { Id: 'same', SellerName: 'B', Name: 'One', Brand: 'B', Category: 'C' },
  ])
  assert.equal(profile.rowCount, 3)
  assert.equal(profile.duplicateGlobalIdCount, 2)
  assert.equal(profile.duplicateSellerScopedIdCount, 1)
  assert.equal(profile.nullCounts.Brand, 1)
  assert.equal(JSON.stringify(profile).includes('SellerName":"A'), false)
})
