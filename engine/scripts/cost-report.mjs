#!/usr/bin/env node
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { loadProject, parseProjectArgs } from './lib/project.mjs'

try {
  const root = resolve(import.meta.dirname, '..')
  const projectArgs = parseProjectArgs(process.argv.slice(2), { required: false })
  if (projectArgs.remaining.length > 0) throw new Error(`Unknown argument: ${projectArgs.remaining[0]}`)
  const project = projectArgs.projectId ? await loadProject(root, projectArgs.projectId) : null
  const text = await readFile(resolve(root, 'cost/ledger.jsonl'), 'utf8')
  const entries = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
    .filter(entry => !project || entry.projectId === project.id)
  const byChange = new Map()
  for (const entry of entries) {
    const key = `${entry.projectId ?? 'legacy-unscoped'}:${entry.changeId}`
    const row = byChange.get(key) ?? {
      projectId: entry.projectId ?? 'legacy-unscoped',
      changeId: entry.changeId,
      runs: 0,
      actualUsd: 0,
      estimatedUsd: 0,
      actualEntries: 0,
      estimatedEntries: 0,
      unavailable: 0,
    }
    row.runs += 1
    if (entry.actualUsd === null) row.unavailable += 1
    else {
      row.actualUsd += entry.actualUsd
      row.actualEntries += 1
    }
    if (entry.estimatedUsd !== null) {
      row.estimatedUsd += entry.estimatedUsd
      row.estimatedEntries += 1
    }
    byChange.set(key, row)
  }
  console.table([...byChange.values()].map(row => ({
    project: row.projectId,
    change: row.changeId,
    entries: row.runs,
    'estimated USD': row.estimatedEntries > 0 ? row.estimatedUsd.toFixed(6) : 'n/a',
    'known actual USD': row.actualEntries > 0 ? row.actualUsd.toFixed(6) : 'n/a',
    unavailable: row.unavailable,
  })))
} catch (error) {
  console.error(`Cost report failed: ${error.message}`)
  process.exitCode = 1
}
