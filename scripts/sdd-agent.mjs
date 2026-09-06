#!/usr/bin/env node
import { createWriteStream } from 'node:fs'
import { mkdir, open, readFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { relative, resolve } from 'node:path'
import { appendCostEntry, calculateUsd, collectUsageFromSessions, summarizeUsage, ZERO_USAGE, addUsage } from './lib/cost.mjs'
import { atomicWrite, readJson, sha256 } from './lib/files.mjs'
import { buildAgentPrompt, estimatedPromptTokens } from './lib/sdd.mjs'

function parseArgs(argv) {
  const command = argv.shift()
  if (!['prepare', 'run'].includes(command)) throw new Error('Usage: sdd-agent.mjs <prepare|run> --change <id> --spec <SDD-ID[,SDD-ID]> [--route economy|default|escalation]')
  const options = { command, specIds: [], route: 'default', approveEscalation: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--change') options.changeId = argv[++index]
    else if (argument === '--spec') options.specIds.push(...argv[++index].split(',').filter(Boolean))
    else if (argument === '--route') options.route = argv[++index]
    else if (argument === '--escalation-reason') options.escalationReason = argv[++index]
    else if (argument === '--approve-escalation') options.approveEscalation = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (!options.changeId || !/^[a-z0-9][a-z0-9-]{4,80}$/.test(options.changeId)) {
    throw new Error('--change must be a 5-81 character lower-kebab-case ID')
  }
  if (options.specIds.length === 0) throw new Error('At least one --spec is required')
  if (!['economy', 'default', 'escalation'].includes(options.route)) throw new Error('--route must be economy, default, or escalation')
  if (options.route === 'escalation' && (!options.approveEscalation || !options.escalationReason?.trim())) {
    throw new Error('The escalation route requires --approve-escalation and a non-empty --escalation-reason')
  }
  options.specIds = [...new Set(options.specIds)]
  return options
}

function selectRoute(agent, options) {
  const route = agent.routes?.[options.route]
  if (!route) throw new Error(`Agent route is not configured: ${options.route}`)
  return {
    ...agent,
    model: route.model,
    reasoningEffort: route.reasoningEffort,
    patches: [agent.patch, route.patch].filter(Boolean),
  }
}

function validateRepository(root) {
  const result = spawnSync(process.execPath, [resolve(root, 'scripts/validate.mjs'), '--working-tree'], {
    cwd: root,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(`Repository validation failed before run:\n${result.stdout}${result.stderr}`)
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

async function dirtySnapshot(root) {
  const output = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all'])
  const records = output.split('\0').filter(Boolean)
  const snapshot = new Map()
  for (const record of records) {
    const status = record.slice(0, 2)
    const candidate = record.slice(3)
    const path = candidate.includes(' -> ') ? candidate.split(' -> ').at(-1) : candidate
    let digest = 'missing'
    try {
      digest = await sha256(await readFile(resolve(root, path)))
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'EISDIR') throw error
    }
    snapshot.set(path, `${status}:${digest}`)
  }
  return snapshot
}

function changedPaths(before, after) {
  return [...new Set([...before.keys(), ...after.keys()])]
    .filter(path => before.get(path) !== after.get(path))
    .sort()
}

function safeSlug(value) {
  return value.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').slice(0, 60)
}

async function prepare(root, options, agent, policy, pricing) {
  const prompt = await buildAgentPrompt(root, options.changeId, options.specIds)
  const estimatedInput = estimatedPromptTokens(prompt)
  const estimatedCalls = policy.estimatedCalls.map((usage, index) => index === 0 ? {
    ...usage,
    uncachedInputTokens: Math.max(usage.uncachedInputTokens, estimatedInput),
  } : usage)
  const estimatedUsage = estimatedCalls.reduce((total, usage) => addUsage(total, usage), { ...ZERO_USAGE })
  const estimatedUsd = estimatedCalls.reduce((total, usage) => total + calculateUsd(usage, agent.model, pricing), 0)
  if (estimatedUsd > policy.maximumProjectedRunUsd) {
    throw new Error(`Projected cost $${estimatedUsd.toFixed(6)} exceeds the run limit $${policy.maximumProjectedRunUsd.toFixed(2)}`)
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').toLowerCase()
  const runId = `${timestamp}-${safeSlug(options.changeId)}`
  const runRoot = resolve(root, '.sdd/runs', runId)
  await mkdir(runRoot, { recursive: true })
  await atomicWrite(resolve(runRoot, 'prompt.md'), prompt)
  const manifest = {
    schemaVersion: '1.0',
    runId,
    changeId: options.changeId,
    specIds: options.specIds,
    preparedAt: new Date().toISOString(),
    baselineCommit: git(root, ['rev-parse', '--verify', 'HEAD']),
    provider: agent.provider,
    model: agent.model,
    route: options.route,
    reasoningEffort: agent.reasoningEffort,
    escalationReason: options.escalationReason ?? null,
    harnessVersion: agent.harnessVersion,
    estimatedUsage,
    estimatedCalls,
    estimatedUsd,
    currency: pricing.currency,
  }
  await atomicWrite(resolve(runRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  return { prompt, runRoot, manifest }
}

async function changeBudgetCommitted(root, changeId) {
  let entries
  try {
    const text = await readFile(resolve(root, 'cost/ledger.jsonl'), 'utf8')
    entries = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
  const related = entries.filter(entry => entry.changeId === changeId)
  const settled = new Set(related.map(entry => entry.reservationEntryId).filter(Boolean))
  return related.reduce((total, entry) => {
    if (typeof entry.actualUsd === 'number') return total + entry.actualUsd
    if (entry.kind === 'cost-reservation' && !settled.has(entry.entryId) && typeof entry.estimatedUsd === 'number') {
      return total + entry.estimatedUsd
    }
    return total
  }, 0)
}

async function runHarness(root, options, prepared, agent, policy, pricing) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === 'replace-me') throw new Error('OPENAI_API_KEY is required for a live Harness run')
  const executable = resolve(root, 'node_modules/.bin/dsh')
  try {
    await open(executable, 'r').then(handle => handle.close())
  } catch {
    throw new Error('DeepSeek Harness is not installed; run `npm ci` first')
  }

  const lockPath = resolve(root, '.sdd/run.lock')
  await mkdir(resolve(root, '.sdd'), { recursive: true })
  let lock
  try {
    lock = await open(lockPath, 'wx')
    await lock.writeFile(`${process.pid}\n`)
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another SDD run is active (.sdd/run.lock exists)')
    throw error
  }

  const startedAt = new Date()
  const startedMs = startedAt.getTime()
  const dshHome = resolve(root, '.sdd/dsh-home')
  const sessionsRoot = resolve(dshHome, 'sessions')
  const before = await dirtySnapshot(root)
  const stdoutPath = resolve(prepared.runRoot, 'stdout.txt')
  const stderrPath = resolve(prepared.runRoot, 'stderr.txt')
  const stdoutFile = createWriteStream(stdoutPath, { flags: 'w' })
  const stderrFile = createWriteStream(stderrPath, { flags: 'w' })
  let budgetExceeded = false
  let reconciliationError
  let child
  try {
    const committed = await changeBudgetCommitted(root, options.changeId)
    if (committed + prepared.manifest.estimatedUsd > policy.maximumMeasuredChangeUsd) {
      throw new Error(`Change budget would exceed $${policy.maximumMeasuredChangeUsd.toFixed(2)}`)
    }
    const reservation = await appendCostEntry(root, {
      schemaVersion: '1.0',
      entryId: randomUUID(),
      recordedAt: new Date().toISOString(),
      changeId: options.changeId,
      specIds: options.specIds,
      kind: 'cost-reservation',
      measurement: 'estimated',
      provider: agent.provider,
      model: agent.model,
      usage: prepared.manifest.estimatedUsage,
      pricingSnapshotId: pricing.id,
      estimatedUsd: prepared.manifest.estimatedUsd,
      actualUsd: null,
      currency: pricing.currency,
      baselineCommit: prepared.manifest.baselineCommit,
      filesTouched: [],
      runId: prepared.manifest.runId,
      outcome: 'reserved',
      escalationReason: options.escalationReason ?? null,
      reason: 'Conservative pre-call reservation.',
    })
    const patchArguments = agent.patches.flatMap(path => ['--patch', resolve(root, path)])
    child = spawn(executable, [
      '--profile', agent.profile,
      ...patchArguments,
      prepared.prompt,
    ], {
      cwd: root,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        DSH_PERMISSION_MODE: agent.permissionMode,
        DSH_TELEMETRY_MODE: 'DISABLED',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', chunk => { stdoutFile.write(chunk); process.stdout.write(chunk) })
    child.stderr.on('data', chunk => { stderrFile.write(chunk); process.stderr.write(chunk) })

    const monitor = setInterval(async () => {
      if (budgetExceeded || reconciliationError) return
      try {
        const observed = await collectUsageFromSessions(sessionsRoot, startedMs - 2000)
        const summary = summarizeUsage(observed.events, pricing)
        if (summary.totalUsd >= policy.maximumMeasuredRunUsd) {
          budgetExceeded = true
          child.kill('SIGTERM')
        }
      } catch (error) {
        reconciliationError = error
        child.kill('SIGTERM')
      }
    }, policy.monitorIntervalMs)

    const exit = await new Promise((resolveExit, reject) => {
      child.once('error', reject)
      child.once('close', (code, signal) => resolveExit({ code, signal }))
    })
    clearInterval(monitor)
    stdoutFile.end()
    stderrFile.end()

    const observed = await collectUsageFromSessions(sessionsRoot, startedMs - 2000)
    let summary
    try {
      summary = summarizeUsage(observed.events, pricing)
    } catch (error) {
      reconciliationError ??= error
    }
    const after = await dirtySnapshot(root)
    const filesTouched = changedPaths(before, after)
    const totalUsage = summary?.routes.reduce((total, route) => addUsage(total, route.usage), { ...ZERO_USAGE }) ?? null
    const reconciled = Boolean(summary && observed.events.length > 0)
    const outcome = budgetExceeded ? 'budget-exceeded' : exit.code === 0 ? 'completed' : 'failed'
    const entry = await appendCostEntry(root, {
      schemaVersion: '1.0',
      entryId: randomUUID(),
      recordedAt: new Date().toISOString(),
      changeId: options.changeId,
      specIds: options.specIds,
      kind: 'deepseek-harness-openai-run',
      measurement: reconciled ? 'provider-reported-standard-assumed' : 'unreconciled',
      provider: agent.provider,
      model: summary?.routes.length === 1 ? summary.routes[0].model : summary?.routes.length ? 'mixed' : agent.model,
      usage: totalUsage,
      routes: summary?.routes ?? [],
      pricingSnapshotId: pricing.id,
      reservationEntryId: reservation.entryId,
      serviceTierRequested: agent.serviceTierRequested,
      serviceTierActual: null,
      accountingStatus: reconciled ? agent.serviceTierAccounting : 'unreconciled',
      estimatedUsd: null,
      actualUsd: reconciled ? summary.totalUsd : null,
      actualNanoUsd: reconciled ? summary.totalNanoUsd : null,
      currency: pricing.currency,
      baselineCommit: prepared.manifest.baselineCommit,
      filesTouched,
      runId: prepared.manifest.runId,
      sourceSessionFiles: observed.files.map(path => relative(root, path)),
      outcome,
      exitCode: exit.code,
      signal: exit.signal,
      reason: reconciliationError?.message ?? (budgetExceeded ? 'Measured run budget reached; process terminated.' : 'Harness run settled.'),
    })
    await atomicWrite(resolve(prepared.runRoot, 'result.json'), `${JSON.stringify({ exit, budgetExceeded, costEntryId: entry.entryId }, null, 2)}\n`)
    if (reconciliationError) throw new Error(`Cost reconciliation failed closed: ${reconciliationError.message}`)
    if (!reconciled) throw new Error('Harness finished without provider usage; cost is unreconciled')
    if (budgetExceeded) throw new Error(`Measured cost reached the $${policy.maximumMeasuredRunUsd.toFixed(2)} run limit`)
    if (exit.code !== 0) throw new Error(`Harness exited with code ${exit.code}${exit.signal ? ` (${exit.signal})` : ''}`)
    return entry
  } finally {
    stdoutFile.end()
    stderrFile.end()
    await lock?.close()
    const { unlink } = await import('node:fs/promises')
    await unlink(lockPath).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}

try {
  const root = resolve(import.meta.dirname, '..')
  const options = parseArgs(process.argv.slice(2))
  const agent = selectRoute(await readJson(resolve(root, 'config/agent.json')), options)
  const policy = await readJson(resolve(root, 'config/cost-policy.json'))
  const pricing = await readJson(resolve(root, policy.pricingSnapshot))
  validateRepository(root)
  const prepared = await prepare(root, options, agent, policy, pricing)
  console.log(`Prepared ${prepared.manifest.runId}; projected OpenAI cost $${prepared.manifest.estimatedUsd.toFixed(6)}.`)
  if (options.command === 'run') {
    const entry = await runHarness(root, options, prepared, agent, policy, pricing)
    console.log(`Measured OpenAI cost $${entry.actualUsd.toFixed(6)}; ledger entry ${entry.entryId}.`)
  } else {
    console.log(`Prompt: ${resolve(prepared.runRoot, 'prompt.md')}`)
  }
} catch (error) {
  console.error(`SDD agent failed: ${error.message}`)
  process.exitCode = 1
}
