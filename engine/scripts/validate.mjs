#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { calculateUsd } from './lib/cost.mjs'
import { readJson, sha256 } from './lib/files.mjs'
import { discoverProjects, loadProject, PROJECT_ID_PATTERN, resolveContainedPath } from './lib/project.mjs'
import { orderedClosure } from './lib/sdd.mjs'

const engineRoot = resolve(import.meta.dirname, '..')
const workspaceRoot = resolve(engineRoot, '..')
const failures = []
const fail = message => failures.push(message)

function parseArgs(argv) {
  const options = { all: false, projectIds: [], workingTree: false }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--all') options.all = true
    else if (argument === '--working-tree') options.workingTree = true
    else if (argument === '--project') options.projectIds.push(argv[++index])
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (options.all && options.projectIds.length > 0) throw new Error('Use either --all or --project, not both')
  if (!options.all && options.projectIds.length === 0) throw new Error('Use --all or --project <project-id>')
  for (const id of options.projectIds) if (!PROJECT_ID_PATTERN.test(id ?? '')) throw new Error(`Invalid project ID: ${id ?? '<missing>'}`)
  options.projectIds = [...new Set(options.projectIds)]
  return options
}

async function requiredFile(root, path) {
  try {
    return await readFile(resolve(root, path), 'utf8')
  } catch {
    fail(`Required file missing: ${path}`)
    return ''
  }
}

function git(args) {
  return spawnSync('git', args, { cwd: workspaceRoot, encoding: 'utf8' })
}

function validateObjectKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}: unexpected field ${key}`)
}

async function validateSdd(root, manifestPath, traceabilityPath, label, expectedProjectId) {
  let manifest
  let traceability
  try {
    manifest = await readJson(manifestPath)
    traceability = await readJson(traceabilityPath)
  } catch (error) {
    fail(`${label}: ${error.message}`)
    return
  }
  validateObjectKeys(manifest, ['schemaVersion', 'project', 'specifications'], `${label}/manifest.json`)
  validateObjectKeys(traceability, ['schemaVersion', 'requirements'], `${label}/traceability.json`)
  if (manifest.schemaVersion !== '1.0') fail(`${label}: manifest has unsupported schemaVersion`)
  if (manifest.project !== expectedProjectId) fail(`${label}: manifest project must be ${expectedProjectId}`)
  if (traceability.schemaVersion !== '1.0') fail(`${label}: traceability has unsupported schemaVersion`)
  if (!Array.isArray(manifest.specifications)) {
    fail(`${label}: manifest specifications must be an array`)
    return
  }
  if (!Array.isArray(traceability.requirements)) {
    fail(`${label}: traceability requirements must be an array`)
    return
  }
  const ids = manifest.specifications.map(spec => spec.id)
  if (new Set(ids).size !== ids.length) fail(`${label}: duplicate specification IDs`)
  const paths = manifest.specifications.map(spec => spec.path)
  if (new Set(paths).size !== paths.length) fail(`${label}: duplicate specification paths`)
  const byId = new Map(manifest.specifications.map(spec => [spec.id, spec]))
  for (const spec of manifest.specifications) {
    validateObjectKeys(spec, ['id', 'title', 'path', 'kind', 'status', 'dependsOn', 'requirements', 'acceptanceCriteria'], `${label}/${spec.id}`)
    if (typeof spec.id !== 'string' || spec.id === '') fail(`${label}: specification id is required`)
    if (!['product', 'infrastructure'].includes(spec.kind)) fail(`${label}/${spec.id}: invalid kind`)
    if (!['ready', 'implemented', 'verified'].includes(spec.status)) fail(`${label}/${spec.id}: invalid status`)
    if (![spec.dependsOn, spec.requirements, spec.acceptanceCriteria].every(Array.isArray)) {
      fail(`${label}/${spec.id}: dependsOn, requirements, and acceptanceCriteria must be arrays`)
      continue
    }
    for (const dependency of spec.dependsOn) if (!byId.has(dependency)) fail(`${label}/${spec.id}: unknown dependency ${dependency}`)
    let text = ''
    try {
      const specPath = await resolveContainedPath(root, spec.path, `${label}/${spec.id}: spec path`)
      text = await readFile(specPath, 'utf8')
    } catch (error) {
      fail(`${label}/${spec.id}: ${error.message}`)
    }
    if (!text.includes(`Spec ID: \`${spec.id}\``)) fail(`${label}/${spec.path}: missing exact spec ID marker`)
    for (const criterion of spec.acceptanceCriteria) {
      const marker = `**${criterion}:**`
      if (text.split(marker).length !== 2) fail(`${label}/${spec.path}: acceptance criterion ${criterion} must appear exactly once`)
    }
  }
  try {
    orderedClosure(ids, byId)
  } catch (error) {
    fail(`${label}: ${error.message}`)
  }

  const requirementIds = traceability.requirements.map(requirement => requirement.id)
  if (new Set(requirementIds).size !== requirementIds.length) fail(`${label}: duplicate requirement IDs`)
  const covered = new Set()
  for (const requirement of traceability.requirements) {
    validateObjectKeys(requirement, ['id', 'authority', 'summary', 'specIds'], `${label}/${requirement.id}`)
    if (!['user', 'assessment', 'process', 'fixture-observation'].includes(requirement.authority)) {
      fail(`${label}/${requirement.id}: invalid authority class`)
    }
    if (!Array.isArray(requirement.specIds) || requirement.specIds.length === 0) fail(`${label}/${requirement.id}: no owning specs`)
    for (const specId of requirement.specIds) {
      const spec = byId.get(specId)
      if (!spec) fail(`${label}/${requirement.id}: unknown spec ${specId}`)
      else if (!spec.requirements.includes(requirement.id)) fail(`${label}/${requirement.id}: ${specId} does not declare reciprocal ownership`)
      covered.add(requirement.id)
    }
  }
  for (const spec of manifest.specifications) {
    for (const requirement of spec.requirements) {
      if (!requirementIds.includes(requirement)) fail(`${label}/${spec.id}: unknown requirement ${requirement}`)
      else if (!traceability.requirements.find(candidate => candidate.id === requirement).specIds.includes(spec.id)) {
        fail(`${label}/${spec.id}: requirement ${requirement} does not declare reciprocal ownership`)
      }
    }
  }
  if (covered.size !== requirementIds.length) fail(`${label}: orphan requirements found`)
}

async function validateConfiguration(projects) {
  const packageJson = await readJson(resolve(engineRoot, 'package.json'))
  const agent = await readJson(resolve(engineRoot, 'config/agent.json'))
  const policy = await readJson(resolve(engineRoot, 'config/cost-policy.json'))
  const pricing = await readJson(resolve(engineRoot, policy.pricingSnapshot))
  if (packageJson.devDependencies[agent.harnessPackage] !== agent.harnessVersion) {
    fail('engine/config/agent.json Harness version does not match engine/package.json')
  }
  if (agent.provider !== pricing.provider) fail('Agent provider does not match pricing provider')
  try {
    for (const usage of policy.estimatedCalls) {
      calculateUsd(usage, agent.model, pricing)
      calculateUsd(usage, agent.economyModel, pricing)
      calculateUsd(usage, agent.escalationModel, pricing)
    }
  } catch (error) {
    fail(error.message)
  }
  if (policy.maximumProjectedRunUsd > policy.maximumMeasuredRunUsd) {
    fail('Projected run budget must not exceed measured run budget')
  }
  if (policy.maximumMeasuredRunUsd > policy.maximumMeasuredChangeUsd) {
    fail('Measured run budget must not exceed measured change budget')
  }
  if (pricing.costUnit !== 'usd-nanodollars-per-token') fail('OpenAI price book must use integer nanodollars')
  if (!pricing.reviewBy || Number.isNaN(Date.parse(pricing.reviewBy))) fail('OpenAI price book requires a reviewBy timestamp')
  const allowedModels = new Set([agent.economyModel, agent.model, agent.escalationModel])
  for (const model of Object.keys(pricing.models)) if (!allowedModels.has(model)) fail(`Unexpected priced model: ${model}`)
  for (const model of allowedModels) if (!pricing.models[model]) fail(`Configured model is unpriced: ${model}`)
  for (const [model, rates] of Object.entries(pricing.models)) {
    for (const field of ['inputNanoUsdPerToken', 'cachedInputNanoUsdPerToken', 'cacheWriteNanoUsdPerToken', 'outputNanoUsdPerToken']) {
      if (!Number.isSafeInteger(rates[field]) || rates[field] < 0) fail(`${model}: ${field} must be a non-negative safe integer`)
    }
  }
  for (const project of projects) {
    let sources
    try {
      sources = await readJson(project.sourcesPath)
    } catch (error) {
      fail(`${project.id}: ${error.message}`)
      continue
    }
    if (!Array.isArray(sources.sources)) {
      fail(`${project.id}: sources manifest must contain a sources array`)
      continue
    }
    const sourceIds = new Set()
    for (const source of sources.sources) {
      if (sourceIds.has(source.id)) fail(`${project.id}: duplicate source ID ${source.id}`)
      sourceIds.add(source.id)
      if (!['json', 'sqlite'].includes(source.kind)) fail(`${project.id}/${source.id}: unsupported source kind`)
      if (!/^https:\/\//.test(source.url)) fail(`${project.id}/${source.id}: source URL must use HTTPS`)
      if (typeof source.fileName !== 'string' || basename(source.fileName) !== source.fileName) {
        fail(`${project.id}/${source.id}: fileName must be a basename`)
      }
      if (!/^[a-f0-9]{64}$/.test(source.sha256)) fail(`${project.id}/${source.id}: invalid SHA-256`)
      if (!Number.isSafeInteger(source.bytes) || source.bytes <= 0) fail(`${project.id}/${source.id}: invalid byte count`)
      if (source.profile !== undefined) {
        if (source.kind !== 'json') fail(`${project.id}/${source.id}: profile is supported only for JSON sources`)
        validateObjectKeys(source.profile, ['expectedRoot', 'metrics'], `${project.id}/${source.id}/profile`)
        if (source.profile.expectedRoot !== undefined && !['array', 'object', 'string', 'number', 'boolean', 'null'].includes(source.profile.expectedRoot)) {
          fail(`${project.id}/${source.id}: invalid expectedRoot`)
        }
      }
      const metrics = source.profile?.metrics ?? []
      if (!Array.isArray(metrics)) {
        fail(`${project.id}/${source.id}: profile metrics must be an array`)
        continue
      }
      const metricNames = new Set()
      for (const metric of metrics) {
        if (metricNames.has(metric.name)) fail(`${project.id}/${source.id}: duplicate profile metric ${metric.name}`)
        metricNames.add(metric.name)
        if (!/^[A-Za-z][A-Za-z0-9]{1,63}$/.test(metric.name ?? '')) fail(`${project.id}/${source.id}: invalid profile metric name`)
        if (['rowCount', 'fields', 'types', 'nullCounts'].includes(metric.name)) fail(`${project.id}/${source.id}: profile metric shadows a built-in field`)
        if (!['distinct-count', 'duplicate-count'].includes(metric.kind)) fail(`${project.id}/${source.id}: invalid profile metric kind`)
        if (!Array.isArray(metric.fields) || metric.fields.length === 0 || metric.fields.some(field => typeof field !== 'string' || field === '')) {
          fail(`${project.id}/${source.id}: profile metric fields must be non-empty strings`)
        }
      }
    }
  }
}

async function validateLedger(options) {
  const text = await requiredFile(engineRoot, 'cost/ledger.jsonl')
  const legacyUnscopedEntries = new Set([
    '5d5012ef-48e1-485a-befc-d6e612e92aa8',
    'ace384c8-ca18-4e35-a889-75ba8dbfdc8b',
  ])
  let previous = null
  const changeIds = new Set()
  const entryIds = new Set()
  for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      fail(`engine/cost/ledger.jsonl:${index + 1}: invalid JSON`)
      continue
    }
    if (entryIds.has(entry.entryId)) fail(`cost ledger: duplicate entryId ${entry.entryId}`)
    entryIds.add(entry.entryId)
    changeIds.add(entry.changeId)
    if (entry.previousEntryHash !== previous) fail(`cost ledger entry ${entry.entryId}: broken previousEntryHash`)
    const { entryHash, ...hashed } = entry
    const expected = await sha256(JSON.stringify(hashed))
    if (entryHash !== expected) fail(`cost ledger entry ${entry.entryId}: invalid entryHash`)
    previous = entryHash
    if (entry.currency !== 'USD') fail(`cost ledger entry ${entry.entryId}: currency must be USD`)
    if (entry.projectId === undefined && !legacyUnscopedEntries.has(entry.entryId)) {
      fail(`cost ledger entry ${entry.entryId}: missing projectId`)
    } else if (entry.projectId !== undefined && !PROJECT_ID_PATTERN.test(entry.projectId)) {
      fail(`cost ledger entry ${entry.entryId}: invalid projectId`)
    }
    if (entry.actualUsd === 0 && entry.measurement === 'unavailable') {
      fail(`cost ledger entry ${entry.entryId}: unavailable cost must not be represented as zero`)
    }
  }

  const comparisonRef = options.workingTree ? 'HEAD' : 'HEAD^'
  let previousLedger
  for (const path of ['engine/cost/ledger.jsonl', 'cost/ledger.jsonl']) {
    const candidate = git(['show', `${comparisonRef}:${path}`])
    if (candidate.status === 0) {
      previousLedger = candidate.stdout
      break
    }
  }
  if (previousLedger !== undefined) {
    const prefix = previousLedger.endsWith('\n') ? previousLedger : `${previousLedger}\n`
    if (!text.startsWith(prefix)) fail(`engine/cost/ledger.jsonl must append to, not rewrite, ${comparisonRef}`)
  }

  if (!options.workingTree) {
    const log = git(['log', '--no-merges', '--format=%H%x1f%B%x1e'])
    if (log.status === 0) {
      for (const record of log.stdout.split('\x1e').filter(value => value.trim())) {
        const [sha, body = ''] = record.split('\x1f')
        const trailer = /^Cost-Entry:\s*([a-z0-9][a-z0-9-]{4,80})\s*$/mi.exec(body)
        if (!trailer) fail(`commit ${sha.trim().slice(0, 12)}: missing Cost-Entry trailer`)
        else if (!changeIds.has(trailer[1])) fail(`commit ${sha.trim().slice(0, 12)}: unknown Cost-Entry ${trailer[1]}`)
      }
    }
  }
}

async function validateNoSecrets(projects) {
  const listed = git(['ls-files', '--cached', '--others', '--exclude-standard'])
  if (listed.status !== 0) return
  const privateSourceNames = new Set()
  for (const project of projects) {
    const sources = await readJson(project.sourcesPath)
    for (const source of sources.sources ?? []) privateSourceNames.add(source.fileName)
  }
  const patterns = [
    /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
    /OPENAI_API_KEY\s*=\s*(?!replace-me)[^\s#]+/,
  ]
  for (const path of listed.stdout.split(/\r?\n/).filter(Boolean)) {
    const sddPath = /(^|\/)\.sdd\/(.*)$/.exec(path)
    const allowedHistory = sddPath && (sddPath[2] === 'README.md' || /^history\/[a-z0-9][a-z0-9-]{2,62}\//.test(sddPath[2]))
    if (/\.pdf$/i.test(path) || /\.(?:db|sqlite|sqlite3)$/i.test(path) || privateSourceNames.has(basename(path)) || (sddPath && !allowedHistory)) {
      fail(`${path}: private source or generated Harness state must not be tracked`)
    }
    if (/\.(?:db|png|jpg|jpeg|gif|pdf)$/.test(path)) continue
    let content
    try {
      content = await readFile(resolve(workspaceRoot, path), 'utf8')
    } catch {
      continue
    }
    for (const pattern of patterns) if (pattern.test(content)) fail(`${path}: possible credential material`)
  }
}

try {
  const options = parseArgs(process.argv.slice(2))
  const projects = options.all
    ? await discoverProjects(engineRoot)
    : await Promise.all(options.projectIds.map(id => loadProject(engineRoot, id)))
  if (projects.length === 0) fail('No projects found under projects/')
  await validateSdd(
    engineRoot,
    resolve(engineRoot, 'docs/sdd/manifest.json'),
    resolve(engineRoot, 'docs/sdd/traceability.json'),
    'engine',
    'sdd-delivery-engine',
  )
  for (const project of projects) {
    await validateSdd(project.root, project.manifestPath, project.traceabilityPath, project.id, project.id)
  }
  await validateConfiguration(projects)
  await validateLedger(options)
  await validateNoSecrets(projects)
} catch (error) {
  fail(error.message)
}

if (failures.length > 0) {
  console.error('Validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('Engine, projects, SDD traceability, sources, OpenAI pricing, cost ledger, and secret checks passed.')
}
