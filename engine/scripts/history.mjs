#!/usr/bin/env node
import { resolve } from 'node:path'
import { createHistory, validateHistory } from './lib/history.mjs'
import { loadProject, parseProjectArgs } from './lib/project.mjs'

function options(argv) {
  const command = argv.shift()
  if (!['create', 'validate'].includes(command)) throw new Error('Usage: history.mjs <create|validate> --project <project-id> --snapshot <snapshot-id> [--cutoff <ISO-8601>]')
  const projectArgs = parseProjectArgs(argv); const result = { command, projectId: projectArgs.projectId }
  for (let index = 0; index < projectArgs.remaining.length; index += 1) {
    const argument = projectArgs.remaining[index]
    if (argument === '--snapshot') result.snapshot = projectArgs.remaining[++index]
    else if (argument === '--cutoff') result.cutoff = projectArgs.remaining[++index]
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (!result.snapshot) throw new Error('--snapshot <snapshot-id> is required')
  if (command === 'create' && !result.cutoff) throw new Error('--cutoff <ISO-8601> is required for create')
  if (command === 'validate' && result.cutoff) throw new Error('--cutoff is valid only for create')
  return result
}
try {
  const parsed = options(process.argv.slice(2)); const engineRoot = resolve(import.meta.dirname, '..'); const project = await loadProject(engineRoot, parsed.projectId)
  const path = parsed.command === 'create' ? await createHistory(engineRoot, project, parsed) : await validateHistory(engineRoot, project, parsed)
  console.log(`History snapshot ${parsed.command === 'create' ? 'created' : 'validated'}: ${path}`)
} catch (error) { console.error(`History ${process.argv[2] ?? 'command'} failed: ${error.message}`); process.exitCode = 1 }
