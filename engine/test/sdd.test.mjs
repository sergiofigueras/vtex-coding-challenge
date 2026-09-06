import assert from 'node:assert/strict'
import test from 'node:test'
import { orderedClosure } from '../scripts/lib/sdd.mjs'

test('orders dependencies before requested specs and removes duplicates', () => {
  const byId = new Map([
    ['A', { id: 'A', dependsOn: [] }],
    ['B', { id: 'B', dependsOn: ['A'] }],
    ['C', { id: 'C', dependsOn: ['A', 'B'] }],
  ])
  assert.deepEqual(orderedClosure(['C', 'B'], byId).map(spec => spec.id), ['A', 'B', 'C'])
})

test('rejects dependency cycles', () => {
  const byId = new Map([
    ['A', { id: 'A', dependsOn: ['B'] }],
    ['B', { id: 'B', dependsOn: ['A'] }],
  ])
  assert.throws(() => orderedClosure(['A'], byId), /cycle/)
})
