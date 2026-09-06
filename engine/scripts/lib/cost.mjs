import { readFile } from 'node:fs/promises'
import { zstdDecompressSync } from 'node:zlib'
import { basename, resolve } from 'node:path'
import { appendJsonLine, sha256, walkFiles } from './files.mjs'

const USAGE_FIELDS = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
]

function validTokenCount(value) {
  return Number.isSafeInteger(value) && value >= 0
}

export function normalizeUsage(value) {
  if (value === null || typeof value !== 'object') return undefined
  if (!validTokenCount(value.inputTokens) || !validTokenCount(value.outputTokens)) return undefined
  for (const field of USAGE_FIELDS.slice(2)) {
    if (value[field] !== undefined && !validTokenCount(value[field])) return undefined
  }
  return {
    uncachedInputTokens: value.inputTokens,
    cacheReadTokens: value.cacheReadTokens ?? 0,
    cacheWriteTokens: value.cacheWriteTokens ?? 0,
    outputTokens: value.outputTokens,
  }
}

export function addUsage(left, right) {
  return {
    uncachedInputTokens: left.uncachedInputTokens + right.uncachedInputTokens,
    cacheReadTokens: left.cacheReadTokens + right.cacheReadTokens,
    cacheWriteTokens: left.cacheWriteTokens + right.cacheWriteTokens,
    outputTokens: left.outputTokens + right.outputTokens,
  }
}

export const ZERO_USAGE = Object.freeze({
  uncachedInputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
})

function resolveModelPricing(model, pricing) {
  for (const [canonicalModel, candidate] of Object.entries(pricing.models)) {
    if (canonicalModel === model || candidate.aliases?.includes(model)) {
      return { canonicalModel, rates: candidate }
    }
  }
  throw new Error(`No pricing configured for model ${model}`)
}

export function calculateUsd(usage, model, pricing, options = {}) {
  const nanoUsd = calculateNanoUsd(usage, model, pricing, options)
  return Number((Number(nanoUsd) / 1_000_000_000).toFixed(9))
}

export function calculateNanoUsd(usage, model, pricing) {
  const { rates } = resolveModelPricing(model, pricing)
  const promptTokens = usage.uncachedInputTokens + usage.cacheReadTokens + usage.cacheWriteTokens
  const longContext = rates.longContext && promptTokens > rates.longContext.thresholdInputTokens
  const inputMultiplier = longContext ? rates.longContext.inputMultiplier : 1
  const outputMultiplier = longContext ? rates.longContext.outputMultiplier : 1
  const integerRates = [
    rates.inputNanoUsdPerToken,
    rates.cachedInputNanoUsdPerToken,
    rates.cacheWriteNanoUsdPerToken,
    rates.outputNanoUsdPerToken,
  ]
  if (!integerRates.every(rate => Number.isSafeInteger(rate) && rate >= 0)) {
    throw new Error(`Invalid integer pricing for model ${model}`)
  }
  const scaled = (tokens, rate, multiplier) => {
    const doubledMultiplier = Math.round(multiplier * 2)
    return BigInt(tokens) * BigInt(rate) * BigInt(doubledMultiplier) / 2n
  }
  return (
    scaled(usage.uncachedInputTokens, rates.inputNanoUsdPerToken, inputMultiplier)
    + scaled(usage.cacheReadTokens, rates.cachedInputNanoUsdPerToken, inputMultiplier)
    + scaled(usage.cacheWriteTokens, rates.cacheWriteNanoUsdPerToken, inputMultiplier)
    + scaled(usage.outputTokens, rates.outputNanoUsdPerToken, outputMultiplier)
  )
}

export function canonicalModel(model, pricing) {
  const modelPricing = resolveModelPricing(model, pricing)
  if (!modelPricing) throw new Error(`No pricing configured for model ${model}`)
  return modelPricing.canonicalModel
}

function routeFromData(data, fallback) {
  const candidates = [
    data?.message?.source,
    data?.route,
    data?.header?.config,
    data,
  ]
  for (const candidate of candidates) {
    if (candidate?.provider && candidate?.model) {
      return { provider: String(candidate.provider), model: String(candidate.model) }
    }
  }
  return fallback
}

function scanCompleteZstdFrames(buffer) {
  const frames = []
  let offset = 0
  while (offset < buffer.length) {
    const start = offset
    if (buffer.length - offset < 5 || buffer.readUInt32LE(offset) !== 0xfd2fb528) {
      throw new Error(`Invalid Zstandard session frame at byte ${offset}`)
    }
    offset += 4
    const descriptor = buffer.readUInt8(offset)
    offset += 1
    if ((descriptor & 0x18) !== 0) throw new Error(`Invalid Zstandard frame descriptor at byte ${offset - 1}`)
    const contentSizeFlag = descriptor >>> 6
    const singleSegment = (descriptor & 0x20) !== 0
    const checksum = (descriptor & 0x04) !== 0
    const dictionaryFlag = descriptor & 0x03
    const dictionaryBytes = dictionaryFlag === 3 ? 4 : dictionaryFlag
    const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 1 << contentSizeFlag
    const headerBytes = (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes
    if (buffer.length - offset < headerBytes) throw new Error(`Incomplete Zstandard frame header at byte ${start}`)
    offset += headerBytes
    for (;;) {
      if (buffer.length - offset < 3) throw new Error(`Incomplete Zstandard block header at byte ${start}`)
      const blockHeader = buffer.readUIntLE(offset, 3)
      offset += 3
      const lastBlock = (blockHeader & 1) !== 0
      const blockType = (blockHeader >>> 1) & 3
      const blockSize = blockHeader >>> 3
      if (blockType === 3) throw new Error(`Reserved Zstandard block type at byte ${offset - 3}`)
      const payloadBytes = blockType === 1 ? 1 : blockSize
      if (buffer.length - offset < payloadBytes) throw new Error(`Incomplete Zstandard block at byte ${start}`)
      offset += payloadBytes
      if (lastBlock) break
    }
    if (checksum) {
      if (buffer.length - offset < 4) throw new Error(`Incomplete Zstandard checksum at byte ${start}`)
      offset += 4
    }
    frames.push(buffer.subarray(start, offset))
  }
  return frames
}

export async function readSessionText(path) {
  const contents = await readFile(path)
  if (!path.endsWith('.zstd')) return contents.toString('utf8')
  return Buffer.concat(scanCompleteZstdFrames(contents).map(frame => zstdDecompressSync(frame))).toString('utf8')
}

export async function usageEventsFromJsonl(path) {
  const text = await readSessionText(path)
  const records = []
  let route
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (line.trim() === '') continue
    let row
    try {
      row = JSON.parse(line)
    } catch {
      continue
    }
    const event = row?.type === 'session_event' && row.event ? row.event : row
    route = routeFromData(event?.data, route)
    const usage = normalizeUsage(event?.data?.usage)
    if (!usage || !route) continue
    records.push({
      key: `${path}:${event.seq ?? index + 1}:${event.type ?? 'unknown'}`,
      sessionFile: path,
      sessionId: row.sessionId ?? event.sessionId ?? basename(path, '.jsonl'),
      eventType: event.type ?? 'unknown',
      eventSeq: event.seq ?? null,
      provider: route.provider,
      model: route.model,
      usage,
    })
  }
  return records
}

export async function snapshotUsageEventIdentities(sessionRoot) {
  const files = await walkFiles(sessionRoot, path => path.endsWith('.jsonl') || path.endsWith('.jsonl.zstd'))
  const events = (await Promise.all(files.map(usageEventsFromJsonl))).flat()
  return new Set(events.map(event => event.key))
}

export async function collectUsageFromSessions(sessionRoot, changedSinceMs = 0, options = {}) {
  const { stat } = await import('node:fs/promises')
  const files = await walkFiles(sessionRoot, path => path.endsWith('.jsonl') || path.endsWith('.jsonl.zstd'))
  const selected = []
  for (const path of files) {
    const metadata = await stat(path)
    if (metadata.mtimeMs >= changedSinceMs) selected.push(path)
  }
  const perFile = await Promise.all(selected.map(async path => ({ path, events: await usageEventsFromJsonl(path) })))
  const events = perFile.flatMap(item => item.events)
  const unique = [...new Map(events.map(event => [event.key, event])).values()]
  const excluded = options.excludeKeys instanceof Set ? options.excludeKeys : new Set()
  const fresh = unique.filter(event => !excluded.has(event.key))
  const contributing = [...new Set(fresh.map(event => event.sessionFile))]
  return { files: contributing, events: fresh }
}

export function summarizeUsage(events, pricing, options = {}) {
  const groups = new Map()
  for (const event of events) {
    const key = `${event.provider}/${event.model}`
    const current = groups.get(key) ?? {
      provider: event.provider,
      model: event.model,
      usage: { ...ZERO_USAGE },
      eventCount: 0,
      amountNanoUsd: 0n,
    }
    current.usage = addUsage(current.usage, event.usage)
    current.eventCount += 1
    current.amountNanoUsd += calculateNanoUsd(event.usage, event.model, pricing, options)
    groups.set(key, current)
  }
  let totalNanoUsd = 0n
  const routes = [...groups.values()].map(group => {
    const amountUsd = Number((Number(group.amountNanoUsd) / 1_000_000_000).toFixed(9))
    totalNanoUsd += group.amountNanoUsd
    const { amountNanoUsd, ...serializable } = group
    return { ...serializable, amountNanoUsd: amountNanoUsd.toString(), amountUsd }
  })
  return {
    routes,
    totalNanoUsd: totalNanoUsd.toString(),
    totalUsd: Number((Number(totalNanoUsd) / 1_000_000_000).toFixed(9)),
  }
}

export async function appendCostEntry(root, entry) {
  if (!/^[a-z0-9][a-z0-9-]{2,62}$/.test(entry.projectId ?? '')) {
    throw new Error('Every new cost entry requires a valid projectId')
  }
  const ledgerPath = resolve(root, 'cost/ledger.jsonl')
  let previousEntryHash = null
  try {
    const lines = (await readFile(ledgerPath, 'utf8')).split(/\r?\n/).filter(Boolean)
    if (lines.length > 0) previousEntryHash = JSON.parse(lines.at(-1)).entryHash
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const chained = { ...entry, previousEntryHash }
  const entryHash = await sha256(JSON.stringify(chained))
  const finalEntry = { ...chained, entryHash }
  await appendJsonLine(ledgerPath, finalEntry)
  return finalEntry
}
