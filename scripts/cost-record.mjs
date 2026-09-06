#!/usr/bin/env node
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { appendCostEntry } from './lib/cost.mjs'

function parseArgs(argv) {
  const options = { specIds: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--change') options.changeId = argv[++index]
    else if (argument === '--spec') options.specIds.push(...argv[++index].split(',').filter(Boolean))
    else if (argument === '--reason') options.reason = argv[++index]
    else if (argument === '--amount-usd') options.amountUsd = Number(argv[++index])
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (!options.changeId || !/^[a-z0-9][a-z0-9-]{4,80}$/.test(options.changeId)) {
    throw new Error('--change must be a 5-81 character lower-kebab-case ID')
  }
  if (!options.reason?.trim()) throw new Error('--reason is required')
  if (options.amountUsd !== undefined && (!Number.isFinite(options.amountUsd) || options.amountUsd < 0)) {
    throw new Error('--amount-usd must be a non-negative number')
  }
  return options
}

try {
  const root = resolve(import.meta.dirname, '..')
  const options = parseArgs(process.argv.slice(2))
  const measured = options.amountUsd !== undefined
  const entry = {
    schemaVersion: '1.0',
    entryId: randomUUID(),
    recordedAt: new Date().toISOString(),
    changeId: options.changeId,
    specIds: [...new Set(options.specIds)].sort(),
    kind: 'external',
    measurement: measured ? 'user-supplied' : 'unavailable',
    provider: null,
    model: null,
    usage: null,
    pricingSnapshotId: null,
    estimatedUsd: null,
    actualUsd: measured ? options.amountUsd : null,
    currency: 'USD',
    filesTouched: [],
    reason: options.reason.trim(),
  }
  await appendCostEntry(root, entry)
  console.log(`Recorded cost entry ${entry.entryId} for ${entry.changeId}`)
} catch (error) {
  console.error(`Cost record failed: ${error.message}`)
  process.exitCode = 1
}
