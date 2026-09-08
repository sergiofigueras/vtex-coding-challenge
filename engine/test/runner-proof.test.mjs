import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtemp, writeFile, appendFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { snapshotUsageEventIdentities, collectUsageFromSessions } from '../scripts/lib/cost.mjs'
import { installChildTermination } from '../scripts/lib/child-termination.mjs'

const event = (seq, input = 1) => JSON.stringify({ sessionId: 's1', type: 'session_event', event: { seq, type: 'response.completed', data: { provider: 'openai', model: 'gpt-test', usage: { inputTokens: input, outputTokens: 2 } } } }) + '\n'

function fakeChild() {
  return { exitCode: null, signalCode: null, kills: [], kill(signal) { this.kills.push(signal) } }
}

test('usage isolation excludes baseline, includes appended events, and returns contributors only', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runner-proof-'))
  const first = join(root, 'session.jsonl')
  const unrelated = join(root, 'unrelated.jsonl')
  await writeFile(first, event(1))
  await writeFile(unrelated, '{"not":"usage"}\n')
  const baseline = await snapshotUsageEventIdentities(root)
  await appendFile(first, event(2, 3))
  const collected = await collectUsageFromSessions(root, 0, { excludeKeys: baseline })
  assert.equal(collected.events.length, 1)
  assert.deepEqual(collected.files, [first])
})

test('two rapid attempt baselines never double count the first attempt', async () => {
  const root = await mkdtemp(join(tmpdir(), 'runner-proof-'))
  const file = join(root, 'session.jsonl')
  await writeFile(file, event(1))
  const firstBaseline = await snapshotUsageEventIdentities(root)
  await appendFile(file, event(2))
  const first = await collectUsageFromSessions(root, 0, { excludeKeys: firstBaseline })
  const secondBaseline = await snapshotUsageEventIdentities(root)
  await appendFile(file, event(3))
  const second = await collectUsageFromSessions(root, 0, { excludeKeys: secondBaseline })
  assert.equal(first.events.length, 1)
  assert.equal(second.events.length, 1)
  assert.equal(second.events[0].eventSeq, 3)
})

test('active-child termination uses SIGTERM then injected grace SIGKILL', () => {
  const child = fakeChild()
  const signal = new AbortController()
  let callback
  const cleanup = installChildTermination({ child, signal: signal.signal, graceMs: 10, setTimeoutFn: fn => { callback = fn; return 1 }, clearTimeoutFn: () => {} })
  signal.abort()
  assert.deepEqual(child.kills, ['SIGTERM'])
  callback()
  assert.deepEqual(child.kills, ['SIGTERM', 'SIGKILL'])
  cleanup()
})

test('active-child termination does not kill after graceful close and cleans listener/timer', () => {
  const child = fakeChild()
  const signal = new AbortController()
  let cleared = 0
  let callback
  const cleanup = installChildTermination({ child, signal: signal.signal, graceMs: 10, setTimeoutFn: fn => { callback = fn; return 7 }, clearTimeoutFn: () => { cleared += 1 } })
  signal.abort()
  assert.deepEqual(child.kills, ['SIGTERM'])
  child.exitCode = 0
  cleanup()
  callback?.()
  signal.abort()
  assert.deepEqual(child.kills, ['SIGTERM'])
  assert.equal(cleared, 1)
})

test('pre-aborted signal terminates immediately and cleanup is idempotent', () => {
  const child = fakeChild()
  const controller = new AbortController()
  controller.abort()
  let clears = 0
  const cleanup = installChildTermination({ child, signal: controller.signal, setTimeoutFn: () => 3, clearTimeoutFn: () => { clears += 1 } })
  assert.deepEqual(child.kills, ['SIGTERM'])
  cleanup(); cleanup()
  assert.equal(clears, 1)
})
