import assert from 'node:assert/strict'
import test from 'node:test'
import { formatSuccessfulRunFooter } from '../scripts/lib/cli-output.mjs'

test('formats successful completion honestly with injected lifecycle accounting', () => {
  assert.equal(formatSuccessfulRunFooter({ accounting: { cumulativeKnownActualUsd: 1.25, unreconciledAttempts: 2 } }), 'Measured cumulative known OpenAI cost $1.250000; 2 unreconciled attempt(s).')
  assert.equal(formatSuccessfulRunFooter({ accounting: { cumulativeKnownActualUsd: undefined, unreconciledAttempts: 1 } }), 'Measured cumulative known OpenAI cost unavailable; 1 unreconciled attempt(s).')
  assert.doesNotThrow(() => formatSuccessfulRunFooter({ accounting: {} }))
})
