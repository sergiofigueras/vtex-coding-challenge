#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

try {
  const root = resolve(import.meta.dirname, '..')
  const text = await readFile(resolve(root, 'cost/ledger.jsonl'), 'utf8')
  const entries = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  const byChange = new Map()
  for (const entry of entries) {
    const row = byChange.get(entry.changeId) ?? { changeId: entry.changeId, runs: 0, actualUsd: 0, estimatedUsd: 0, unavailable: 0 }
    row.runs += 1
    if (entry.actualUsd === null) row.unavailable += 1
    else row.actualUsd += entry.actualUsd
    if (entry.estimatedUsd !== null) row.estimatedUsd += entry.estimatedUsd
    byChange.set(entry.changeId, row)
  }
  console.table([...byChange.values()].map(row => ({
    change: row.changeId,
    entries: row.runs,
    'estimated USD': row.estimatedUsd.toFixed(6),
    'known actual USD': row.actualUsd.toFixed(6),
    unavailable: row.unavailable,
  })))
} catch (error) {
  console.error(`Cost report failed: ${error.message}`)
  process.exitCode = 1
}
