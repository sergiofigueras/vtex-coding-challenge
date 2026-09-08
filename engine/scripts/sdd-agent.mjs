#!/usr/bin/env node
import { createWriteStream } from 'node:fs'
import { mkdir, open, readFile } from 'node:fs/promises'
import { spawn, spawnSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { relative, resolve } from 'node:path'
import { appendCostEntry, calculateUsd, collectUsageFromSessions, snapshotUsageEventIdentities, summarizeUsage, ZERO_USAGE, addUsage } from './lib/cost.mjs'
import { atomicWrite, readJson, sha256 } from './lib/files.mjs'
import { loadProject, parseProjectArgs, resolveDshExecutable } from './lib/project.mjs'
import { buildAgentPrompt, estimatedPromptTokens } from './lib/sdd.mjs'
import { CANCELLATION_EXIT_CODE, RATE_LIMIT_EXIT_CODE, classifyProviderFailure, runRateLimitLifecycle, validateRateLimitPolicy } from './lib/rate-limit.mjs'
import { installChildTermination } from './lib/child-termination.mjs'
import { formatSuccessfulRunFooter } from './lib/cli-output.mjs'

function parseArgs(argv) {
  const command = argv.shift()
  if (!['prepare', 'run'].includes(command)) throw new Error('Usage: sdd-agent.mjs <prepare|run> --project <id> --change <id> --spec <SDD-ID[,SDD-ID]> [--route economy|default|escalation] [--rate-limit-fallback economy]')
  const options = { command, specIds: [], route: 'default', approveEscalation: false, rateLimitFallback: null }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--change') options.changeId = argv[++index]
    else if (argument === '--spec') options.specIds.push(...argv[++index].split(',').filter(Boolean))
    else if (argument === '--route') options.route = argv[++index]
    else if (argument === '--escalation-reason') options.escalationReason = argv[++index]
    else if (argument === '--approve-escalation') options.approveEscalation = true
    else if (argument === '--rate-limit-fallback') options.rateLimitFallback = argv[++index]
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
  if (options.rateLimitFallback !== null && options.rateLimitFallback !== 'economy') throw new Error('--rate-limit-fallback only supports economy')
  if (options.rateLimitFallback === 'economy' && options.route !== 'default') throw new Error('--rate-limit-fallback economy is valid only with --route default')
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

function validateRepository(engineRoot, project) {
  const result = spawnSync(process.execPath, [resolve(engineRoot, 'scripts/validate.mjs'), '--project', project.id, '--working-tree'], {
    cwd: project.workspaceRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) throw new Error(`Repository validation failed before run:\n${result.stdout}${result.stderr}`)
}

function git(root, args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${result.stderr}`)
  return result.stdout.trim()
}

function gitPorcelain(root) {
  const result = spawnSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`git status failed: ${result.stderr}`)
  return result.stdout
}

async function dirtySnapshot(root) {
  // Do not trim porcelain output: its leading column is part of the status
  // record and trimming it corrupts the first changed path.
  const output = gitPorcelain(root)
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

async function prepare(project, options, agent, policy, pricing) {
  const prompt = await buildAgentPrompt(project, options.changeId, options.specIds)
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
  const runRoot = resolve(project.stateRoot, 'runs', runId)
  await mkdir(runRoot, { recursive: true })
  await atomicWrite(resolve(runRoot, 'prompt.md'), prompt)
  const manifest = {
    schemaVersion: '1.0',
    runId,
    projectId: project.id,
    changeId: options.changeId,
    specIds: options.specIds,
    preparedAt: new Date().toISOString(),
    baselineCommit: git(project.workspaceRoot, ['rev-parse', '--verify', 'HEAD']),
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

async function changeBudgetCommitted(engineRoot, projectId, changeId) {
  let entries
  try {
    const text = await readFile(resolve(engineRoot, 'cost/ledger.jsonl'), 'utf8')
    entries = text.split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line))
  } catch (error) {
    if (error.code === 'ENOENT') return 0
    throw error
  }
  const related = entries.filter(entry => entry.projectId === projectId && entry.changeId === changeId)
  const settled = new Set(related.map(entry => entry.reservationEntryId).filter(Boolean))
  return related.reduce((total, entry) => {
    if (typeof entry.actualUsd === 'number') return total + entry.actualUsd
    if (entry.kind === 'cost-reservation' && !settled.has(entry.entryId) && typeof entry.estimatedUsd === 'number') {
      return total + entry.estimatedUsd
    }
    return total
  }, 0)
}

async function runHarnessAttempt(engineRoot, project, options, prepared, agent, policy, pricing, lifecycle = {}) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey || apiKey === 'replace-me') throw new Error('OPENAI_API_KEY is required for a live Harness run')
  const executable = resolveDshExecutable(engineRoot)

  const lockPath = resolve(project.stateRoot, 'run.lock')
  await mkdir(project.stateRoot, { recursive: true })
  let lock = lifecycle.lock
  const ownsLock = !lock
  if (ownsLock) {
    try {
      lock = await open(lockPath, 'wx')
      await lock.writeFile(`${process.pid}\n`)
    } catch (error) {
      if (error.code === 'EEXIST') throw new Error('Another SDD run is active (.sdd/run.lock exists)')
      throw error
    }
  }

  const startedAt = new Date()
  const startedMs = startedAt.getTime()
  const dshHome = resolve(project.stateRoot, 'dsh-home')
  const sessionsRoot = resolve(dshHome, 'sessions')
  const before = await dirtySnapshot(project.workspaceRoot)
  const attemptLabel = `attempt-${lifecycle.attemptNumber ?? 1}`
  const stdoutPath = resolve(prepared.runRoot, `${attemptLabel}.stdout.txt`)
  const stderrPath = resolve(prepared.runRoot, `${attemptLabel}.stderr.txt`)
  const stdoutFile = createWriteStream(stdoutPath, { flags: 'w' })
  const stderrFile = createWriteStream(stderrPath, { flags: 'w' })
  let budgetExceeded = false
  let reconciliationError
  let child
  try {
    const committed = await changeBudgetCommitted(engineRoot, project.id, options.changeId)
    const attemptUsageEstimate = prepared.manifest.estimatedCalls[0]
    const attemptEstimatedUsd = calculateUsd(attemptUsageEstimate, agent.model, pricing)
    if (committed + attemptEstimatedUsd > policy.maximumMeasuredChangeUsd) {
      throw new Error(`Change budget would exceed $${policy.maximumMeasuredChangeUsd.toFixed(2)}`)
    }
    if ((lifecycle.cumulativeRunUsd ?? 0) + attemptEstimatedUsd > policy.maximumMeasuredRunUsd) {
      throw new Error(`Run budget would exceed $${policy.maximumMeasuredRunUsd.toFixed(2)}`)
    }
    const usageBeforeAttempt = await snapshotUsageEventIdentities(sessionsRoot)
    const reservation = await appendCostEntry(engineRoot, {
      schemaVersion: '1.0',
      entryId: randomUUID(),
      recordedAt: new Date().toISOString(),
      projectId: project.id,
      changeId: options.changeId,
      specIds: options.specIds,
      kind: 'cost-reservation',
      measurement: 'estimated',
      provider: agent.provider,
      model: agent.model,
      usage: attemptUsageEstimate,
      pricingSnapshotId: pricing.id,
      estimatedUsd: attemptEstimatedUsd,
      actualUsd: null,
      currency: pricing.currency,
      baselineCommit: prepared.manifest.baselineCommit,
      filesTouched: [],
      runId: prepared.manifest.runId,
      outcome: 'reserved',
      escalationReason: options.escalationReason ?? null,
      reason: 'Conservative pre-call reservation.',
    })
    const patchArguments = agent.patches.flatMap(path => ['--patch', resolve(engineRoot, path)])
    child = spawn(executable, [
      '--profile', agent.profile,
      ...patchArguments,
      prepared.prompt,
    ], {
      cwd: project.root,
      env: {
        ...process.env,
        DSH_HOME: dshHome,
        DSH_BUNDLED_SKILL_DIR: resolve(engineRoot, '.dsh/skills'),
        DSH_PERMISSION_MODE: agent.permissionMode,
        DSH_TELEMETRY_MODE: 'DISABLED',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.on('data', chunk => { stdoutFile.write(chunk); process.stdout.write(chunk) })
    child.stderr.on('data', chunk => { stderrFile.write(chunk); process.stderr.write(chunk) })
    const cleanupTermination = installChildTermination({ child, signal: lifecycle.signal, graceMs: policy.terminationGraceMs ?? 2000 })

    const monitor = setInterval(async () => {
      if (budgetExceeded || reconciliationError) return
      try {
        const observed = await collectUsageFromSessions(sessionsRoot, 0, { excludeKeys: usageBeforeAttempt })
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

    let exit
    try {
      exit = await new Promise((resolveExit, reject) => {
        child.once('error', reject)
        child.once('close', (code, signal) => resolveExit({ code, signal }))
      })
    } finally {
      clearInterval(monitor)
      cleanupTermination()
      stdoutFile.end()
      stderrFile.end()
    }

    const observed = await collectUsageFromSessions(sessionsRoot, 0, { excludeKeys: usageBeforeAttempt })
    let summary
    try {
      summary = summarizeUsage(observed.events, pricing)
    } catch (error) {
      reconciliationError ??= error
    }
    const after = await dirtySnapshot(project.workspaceRoot)
    const filesTouched = changedPaths(before, after)
    const totalUsage = summary?.routes.reduce((total, route) => addUsage(total, route.usage), { ...ZERO_USAGE }) ?? null
    const reconciled = Boolean(summary && observed.events.length > 0)
    const cancelled = lifecycle.signal?.aborted || exit.signal === 'SIGTERM' && lifecycle.signal?.aborted
    const outcome = cancelled ? 'cancelled' : budgetExceeded ? 'budget-exceeded' : exit.code === 0 ? 'completed' : 'failed'
    const entry = await appendCostEntry(engineRoot, {
      schemaVersion: '1.0',
      entryId: randomUUID(),
      recordedAt: new Date().toISOString(),
      projectId: project.id,
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
      sourceSessionFiles: observed.files.map(path => relative(project.root, path)),
      outcome,
      exitCode: cancelled ? CANCELLATION_EXIT_CODE : exit.code,
      signal: exit.signal,
      reason: reconciliationError?.message ?? (budgetExceeded ? 'Measured run budget reached; process terminated.' : 'Harness run settled.'),
    })
    await atomicWrite(resolve(prepared.runRoot, `attempt-${lifecycle.attemptNumber ?? 1}.result.json`), `${JSON.stringify({ exit, cancelled, budgetExceeded, costEntryId: entry.entryId, reservationEntryId: reservation.entryId, accountingStatus: entry.accountingStatus, actualUsd: entry.actualUsd, estimatedUsd: reservation.estimatedUsd, sourceSessionFiles: entry.sourceSessionFiles }, null, 2)}\n`)
    await atomicWrite(resolve(prepared.runRoot, 'attempt-result.json'), `${JSON.stringify({ exit, cancelled, budgetExceeded, costEntryId: entry.entryId, reservationEntryId: reservation.entryId, accountingStatus: entry.accountingStatus, actualUsd: entry.actualUsd, estimatedUsd: reservation.estimatedUsd, sourceSessionFiles: entry.sourceSessionFiles }, null, 2)}\n`)
    if (cancelled) return { ...entry, cancelled: true, success: false, exitCode: CANCELLATION_EXIT_CODE }
    if (reconciliationError) throw new Error(`Cost reconciliation failed closed: ${reconciliationError.message}`)
    if (!reconciled) throw new Error('Harness finished without provider usage; cost is unreconciled')
    if (budgetExceeded) throw new Error(`Measured cost reached the $${policy.maximumMeasuredRunUsd.toFixed(2)} run limit`)
    if (exit.code !== 0) throw new Error(`Harness exited with code ${exit.code}${exit.signal ? ` (${exit.signal})` : ''}`)
    return entry
  } finally {
    stdoutFile.end()
    stderrFile.end()
    if (ownsLock) {
      await lock?.close()
      const { unlink } = await import('node:fs/promises')
      await unlink(lockPath).catch(error => { if (error.code !== 'ENOENT') throw error })
    }
  }
}

async function runHarness(engineRoot, project, options, prepared, agent, policy, pricing) {
  const lockPath = resolve(project.stateRoot, 'run.lock')
  await mkdir(project.stateRoot, { recursive: true })
  let lock
  try {
    lock = await open(lockPath, 'wx')
    await lock.writeFile(`${process.pid}\n`)
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error('Another SDD run is active (.sdd/run.lock exists)')
    throw error
  }
  const controller = new AbortController()
  const onSigint = () => controller.abort()
  process.once('SIGINT', onSigint)
  const attemptsMetadata = []
  let cumulativeRunUsd = 0
  try {
    const lifecycle = await runRateLimitLifecycle({
      policy: policy.rateLimit,
      requestedRoute: options.route,
      fallbackAuthorized: options.rateLimitFallback === 'economy',
      signal: controller.signal,
      status: event => console.error(`Rate-limit status: ${JSON.stringify(event)}`),
      attempt: async ({ number, route, signal }) => {
        const attemptAgent = selectRoute(await readJson(resolve(engineRoot, 'config/agent.json')), { ...options, route })
        const resume = number === 1 ? '' : `\n\nRetry resume context: this is attempt ${number}; inspect the existing working tree, preserve all partial changes, and continue only the identical project/change/spec dependency scope after the prior rate-limit outcome.\n`
        const attemptPrepared = { ...prepared, prompt: `${prepared.prompt}${resume}` }
        const stdoutPath = resolve(prepared.runRoot, `attempt-${number}.stdout.txt`)
        const stderrPath = resolve(prepared.runRoot, `attempt-${number}.stderr.txt`)
        try {
          const entry = await runHarnessAttempt(engineRoot, project, options, attemptPrepared, attemptAgent, policy, pricing, { lock, attemptNumber: number, cumulativeRunUsd, signal })
          cumulativeRunUsd += entry.actualUsd ?? entry.estimatedUsd ?? 0
          const cancelled = entry.cancelled === true || signal.aborted
          const record = { success: !cancelled, cancelled, route, model: attemptAgent.model, outcome: cancelled ? 'cancelled' : 'completed', exitCode: cancelled ? CANCELLATION_EXIT_CODE : 0, costEntryId: entry.entryId, actualUsd: typeof entry.actualUsd === 'number' ? entry.actualUsd : null, accountingStatus: entry.accountingStatus ?? (typeof entry.actualUsd === 'number' ? 'reported' : 'unreconciled'), accounting: { costEntryId: entry.entryId, reservationEntryId: entry.reservationEntryId ?? null }, stdoutPath: relative(project.stateRoot, stdoutPath), stderrPath: relative(project.stateRoot, stderrPath) }
          attemptsMetadata.push(record)
          return record
        } catch (error) {
          const stderr = await readFile(stderrPath, 'utf8').catch(() => '')
          const accounting = await readJson(resolve(prepared.runRoot, 'attempt-result.json')).catch(() => null)
          cumulativeRunUsd += accounting?.actualUsd ?? accounting?.estimatedUsd ?? 0
          const classification = classifyProviderFailure({ message: `${error.message}\n${stderr}`, stderr })
          const record = { success: false, cancelled: signal.aborted || error.cancelled || accounting?.cancelled === true, route, model: attemptAgent.model, outcome: signal.aborted || error.cancelled || accounting?.cancelled === true ? 'cancelled' : 'failed', error: { message: error.message, stderr }, classification, accounting, stdoutPath: relative(project.stateRoot, stdoutPath), stderrPath: relative(project.stateRoot, stderrPath) }
          attemptsMetadata.push(record)
          return record
        }
      },
    })
    const result = {
      schemaVersion: '1.0', runId: prepared.manifest.runId, projectId: project.id, changeId: options.changeId, specIds: options.specIds,
      requestedRoute: options.route, rateLimitFallback: options.rateLimitFallback, attempts: lifecycle.attempts.map((attempt, index) => ({ ...attempt, metadata: attemptsMetadata[index] ?? null })), outcome: lifecycle.outcome, exitCode: lifecycle.exitCode,
      nextAction: lifecycle.outcome === 'rate-limit-exhausted' ? 'Resume later, adjust provider capacity, or explicitly authorize --rate-limit-fallback economy on the default route.' : null,
      accounting: { cumulativeKnownActualUsd: attemptsMetadata.reduce((sum, attempt) => sum + (typeof attempt.actualUsd === 'number' ? attempt.actualUsd : 0), 0), knownActualAttempts: attemptsMetadata.filter(attempt => typeof attempt.actualUsd === 'number').length, unreconciledAttempts: attemptsMetadata.filter(attempt => attempt.accountingStatus === 'unreconciled').length, reservations: attemptsMetadata.map(attempt => attempt.accounting?.reservationEntryId ?? attempt.reservationEntryId ?? null) },
    }
    await atomicWrite(resolve(prepared.runRoot, 'result.json'), `${JSON.stringify(result, null, 2)}\n`)
    // Attempt files are durable individually; aggregate streams keep the original
    // run-level stdout/stderr contract for operators and history export.
    for (const stream of ['stdout', 'stderr']) {
      const combined = (await Promise.all(attemptsMetadata.map((_, index) => readFile(resolve(prepared.runRoot, `attempt-${index + 1}.${stream}.txt`), 'utf8').catch(() => '')))).join('')
      await atomicWrite(resolve(prepared.runRoot, `${stream}.txt`), combined)
    }
    if (lifecycle.exitCode !== 0) {
      const message = lifecycle.exitCode === RATE_LIMIT_EXIT_CODE ? result.nextAction : lifecycle.exitCode === CANCELLATION_EXIT_CODE ? 'Operator cancelled the run.' : `Harness terminated: ${lifecycle.outcome}`
      const failure = new Error(message)
      failure.exitCode = lifecycle.exitCode
      throw failure
    }
    return result
  } finally {
    process.removeListener('SIGINT', onSigint)
    await lock.close()
    const { unlink } = await import('node:fs/promises')
    await unlink(lockPath).catch(error => { if (error.code !== 'ENOENT') throw error })
  }
}

try {
  const engineRoot = resolve(import.meta.dirname, '..')
  const projectArgs = parseProjectArgs(process.argv.slice(2))
  const project = await loadProject(engineRoot, projectArgs.projectId)
  const options = parseArgs(projectArgs.remaining)
  const agent = selectRoute(await readJson(resolve(engineRoot, 'config/agent.json')), options)
  const policy = await readJson(resolve(engineRoot, 'config/cost-policy.json'))
  validateRateLimitPolicy(policy)
  const pricing = await readJson(resolve(engineRoot, policy.pricingSnapshot))
  validateRepository(engineRoot, project)
  const prepared = await prepare(project, options, agent, policy, pricing)
  console.log(`Prepared ${prepared.manifest.runId}; projected OpenAI cost $${prepared.manifest.estimatedUsd.toFixed(6)}.`)
  if (options.command === 'run') {
    const entry = await runHarness(engineRoot, project, options, prepared, agent, policy, pricing)
    console.log(formatSuccessfulRunFooter(entry))
  } else {
    console.log(`Prompt: ${resolve(prepared.runRoot, 'prompt.md')}`)
  }
} catch (error) {
  console.error(`SDD agent failed: ${error.message}`)
  process.exitCode = error.exitCode ?? 1
}
