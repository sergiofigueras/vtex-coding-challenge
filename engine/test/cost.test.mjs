import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import test from 'node:test'
import { appendCostEntry, calculateNanoUsd, calculateUsd, usageEventsFromJsonl } from '../scripts/lib/cost.mjs'

const pricing = {
  models: {
    'gpt-5.6-luna': {
      aliases: [],
      inputNanoUsdPerToken: 200,
      cachedInputNanoUsdPerToken: 20,
      cacheWriteNanoUsdPerToken: 250,
      outputNanoUsdPerToken: 1200,
      longContext: { thresholdInputTokens: 272000, inputMultiplier: 2, outputMultiplier: 1.5 },
    },
  },
}

test('pins the verified OpenAI price book and exact allow-listed model rates', async () => {
  const actual = JSON.parse(await readFile(new URL('../config/pricing.openai-2026-09-06.json', import.meta.url), 'utf8'))
  assert.equal(actual.serviceTier, 'default')
  assert.equal(actual.accountingStatus, 'standard-assumed')
  assert.equal(actual.reviewBy, '2026-11-21T00:00:00Z')
  assert.deepEqual(Object.keys(actual.models).sort(), ['gpt-5.6-luna', 'gpt-5.6-sol', 'gpt-5.6-terra'])
  assert.deepEqual(actual.models['gpt-5.6-luna'], {
    aliases: [], inputNanoUsdPerToken: 200, cachedInputNanoUsdPerToken: 20,
    cacheWriteNanoUsdPerToken: 250, outputNanoUsdPerToken: 1200,
    longContext: { thresholdInputTokens: 272000, inputMultiplier: 2, outputMultiplier: 1.5 },
  })
  assert.equal(actual.models['gpt-5.6-terra'].inputNanoUsdPerToken, 2000)
  assert.equal(actual.models['gpt-5.6-terra'].outputNanoUsdPerToken, 12000)
  assert.equal(actual.models['gpt-5.6-sol'].inputNanoUsdPerToken, 4000)
  assert.equal(actual.models['gpt-5.6-sol'].outputNanoUsdPerToken, 20000)
  for (const url of actual.officialUrls) assert.match(url, /^https:\/\/developers\.openai\.com\//)
})

test('prices disjoint OpenAI buckets with integer arithmetic and ignores reasoning breakdown', () => {
  const usage = {
    uncachedInputTokens: 700,
    cacheReadTokens: 200,
    cacheWriteTokens: 100,
    outputTokens: 300,
    reasoningTokens: 100,
  }
  assert.equal(calculateNanoUsd(usage, 'gpt-5.6-luna', pricing), 529000n)
  assert.equal(calculateUsd(usage, 'gpt-5.6-luna', pricing), 0.000529)
})

test('uses base rates at exactly 272K prompt tokens', () => {
  const cost = calculateNanoUsd({
    uncachedInputTokens: 272_000,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 10_000,
  }, 'gpt-5.6-luna', pricing)
  assert.equal(cost, 66_400_000n)
})

test('reprices every bucket when prompt input exceeds 272K', () => {
  const cost = calculateNanoUsd({
    uncachedInputTokens: 272_001,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 10_000,
  }, 'gpt-5.6-luna', pricing)
  assert.equal(cost, 126_800_400n)
})

test('extracts only canonical top-level usage from a Harness assistant event', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vtex-cost-'))
  const path = join(directory, 'session.jsonl')
  const event = {
    type: 'assistant/message',
    seq: 14,
    data: {
      message: { source: { kind: 'model', provider: 'openai', model: 'gpt-5.6-luna' } },
      usage: { inputTokens: 100, cacheReadTokens: 40, cacheWriteTokens: 10, outputTokens: 20 },
      stream: [{ type: 'chunk', chunk: { type: 'usage', usage: { inputTokens: 100, outputTokens: 20 } } }],
    },
  }
  await writeFile(path, `${JSON.stringify(event)}\n`)
  const records = await usageEventsFromJsonl(path)
  assert.equal(records.length, 1)
  assert.deepEqual(records[0].usage, {
    uncachedInputTokens: 100,
    cacheReadTokens: 40,
    cacheWriteTokens: 10,
    outputTokens: 20,
  })
})

test('extracts usage from the Harness concatenated-frame Zstandard session format', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'vtex-cost-zstd-'))
  const path = join(directory, 'session.jsonl.zstd')
  const header = { type: 'session', meta: { id: 'session-one' } }
  const event = {
    type: 'assistant/message',
    seq: 2,
    data: {
      message: { source: { kind: 'model', provider: 'openai', model: 'gpt-5.6-luna' } },
      usage: { inputTokens: 120, cacheReadTokens: 30, cacheWriteTokens: 5, outputTokens: 25 },
    },
  }
  const bytes = Buffer.concat([
    zstdCompressSync(Buffer.from(`${JSON.stringify(header)}\n`)),
    zstdCompressSync(Buffer.from(`${JSON.stringify(event)}\n`)),
  ])
  await writeFile(path, bytes)
  const records = await usageEventsFromJsonl(path)
  assert.equal(records.length, 1)
  assert.deepEqual(records[0].usage, {
    uncachedInputTokens: 120,
    cacheReadTokens: 30,
    cacheWriteTokens: 5,
    outputTokens: 25,
  })
})

test('requires project attribution on every newly appended cost event', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'sdd-cost-'))
  await assert.rejects(appendCostEntry(directory, { entryId: 'missing-project' }), /requires a valid projectId/)
})
