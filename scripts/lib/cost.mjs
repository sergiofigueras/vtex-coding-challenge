import { readFile } from 'node:fs/promises'
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

export async function usageEventsFromJsonl(path) {
  const text = await readFile(path, 'utf8')
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

export async function collectUsageFromSessions(sessionRoot, changedSinceMs = 0) {
  const { stat } = await import('node:fs/promises')
  const files = await walkFiles(sessionRoot, path => path.endsWith('.jsonl'))
  const selected = []
  for (const path of files) {
    const metadata = await stat(path)
    if (metadata.mtimeMs >= changedSinceMs) selected.push(path)
  }
  const events = (await Promise.all(selected.map(usageEventsFromJsonl))).flat()
  const unique = [...new Map(events.map(event => [event.key, event])).values()]
  return { files: selected, events: unique }
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
