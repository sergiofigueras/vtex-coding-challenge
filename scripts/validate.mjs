#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { calculateUsd } from './lib/cost.mjs'
import { readJson, sha256 } from './lib/files.mjs'
import { orderedClosure } from './lib/sdd.mjs'

const root = resolve(import.meta.dirname, '..')
const failures = []
const fail = message => failures.push(message)

async function requiredFile(path) {
  try {
    return await readFile(resolve(root, path), 'utf8')
  } catch {
    fail(`Required file missing: ${path}`)
    return ''
  }
}

function git(args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' })
}

function validateObjectKeys(value, allowed, label) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`${label}: unexpected field ${key}`)
}

async function validateSdd() {
  const manifest = await readJson(resolve(root, 'docs/sdd/manifest.json'))
  const traceability = await readJson(resolve(root, 'docs/sdd/traceability.json'))
  if (manifest.schemaVersion !== '1.0') fail('manifest.json: unsupported schemaVersion')
  const ids = manifest.specifications.map(spec => spec.id)
  if (new Set(ids).size !== ids.length) fail('manifest.json: duplicate specification IDs')
  const paths = manifest.specifications.map(spec => spec.path)
  if (new Set(paths).size !== paths.length) fail('manifest.json: duplicate specification paths')
  const byId = new Map(manifest.specifications.map(spec => [spec.id, spec]))
  for (const spec of manifest.specifications) {
    validateObjectKeys(spec, ['id', 'title', 'path', 'kind', 'status', 'dependsOn', 'requirements', 'acceptanceCriteria'], spec.id)
    if (!['product', 'infrastructure'].includes(spec.kind)) fail(`${spec.id}: invalid kind`)
    if (!['ready', 'implemented', 'verified'].includes(spec.status)) fail(`${spec.id}: invalid status`)
    for (const dependency of spec.dependsOn) if (!byId.has(dependency)) fail(`${spec.id}: unknown dependency ${dependency}`)
    const text = await requiredFile(spec.path)
    if (!text.includes(`Spec ID: \`${spec.id}\``)) fail(`${spec.path}: missing exact spec ID marker`)
    for (const criterion of spec.acceptanceCriteria) {
      const marker = `**${criterion}:**`
      if (text.split(marker).length !== 2) fail(`${spec.path}: acceptance criterion ${criterion} must appear exactly once`)
    }
  }
  try {
    orderedClosure(ids, byId)
  } catch (error) {
    fail(error.message)
  }

  const requirementIds = traceability.requirements.map(requirement => requirement.id)
  if (new Set(requirementIds).size !== requirementIds.length) fail('traceability.json: duplicate requirement IDs')
  const covered = new Set()
  for (const requirement of traceability.requirements) {
    if (!['user', 'assessment', 'process', 'fixture-observation'].includes(requirement.authority)) {
      fail(`${requirement.id}: invalid authority class`)
    }
    if (!Array.isArray(requirement.specIds) || requirement.specIds.length === 0) fail(`${requirement.id}: no owning specs`)
    for (const specId of requirement.specIds) {
      const spec = byId.get(specId)
      if (!spec) fail(`${requirement.id}: unknown spec ${specId}`)
      else if (!spec.requirements.includes(requirement.id)) fail(`${requirement.id}: ${specId} does not declare reciprocal ownership`)
      covered.add(requirement.id)
    }
  }
  for (const spec of manifest.specifications) {
    for (const requirement of spec.requirements) {
      if (!requirementIds.includes(requirement)) fail(`${spec.id}: unknown requirement ${requirement}`)
      else if (!traceability.requirements.find(candidate => candidate.id === requirement).specIds.includes(spec.id)) {
        fail(`${spec.id}: requirement ${requirement} does not declare reciprocal ownership`)
      }
    }
  }
  if (covered.size !== requirementIds.length) fail('traceability.json: orphan requirements found')
}

async function validateConfiguration() {
  const packageJson = await readJson(resolve(root, 'package.json'))
  const agent = await readJson(resolve(root, 'config/agent.json'))
  const policy = await readJson(resolve(root, 'config/cost-policy.json'))
  const pricing = await readJson(resolve(root, policy.pricingSnapshot))
  if (packageJson.devDependencies[agent.harnessPackage] !== agent.harnessVersion) {
    fail('config/agent.json Harness version does not match package.json')
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
  const sources = await readJson(resolve(root, 'config/sources.json'))
  for (const source of sources.sources) {
    if (!/^https:\/\//.test(source.url)) fail(`${source.id}: source URL must use HTTPS`)
    if (!/^[a-f0-9]{64}$/.test(source.sha256)) fail(`${source.id}: invalid SHA-256`)
    if (!Number.isSafeInteger(source.bytes) || source.bytes <= 0) fail(`${source.id}: invalid byte count`)
  }
}

async function validateLedger() {
  const text = await requiredFile('cost/ledger.jsonl')
  let previous = null
  const changeIds = new Set()
  const entryIds = new Set()
  for (const [index, line] of text.split(/\r?\n/).filter(Boolean).entries()) {
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      fail(`cost/ledger.jsonl:${index + 1}: invalid JSON`)
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
    if (entry.actualUsd === 0 && entry.measurement === 'unavailable') {
      fail(`cost ledger entry ${entry.entryId}: unavailable cost must not be represented as zero`)
    }
  }

  const comparisonRef = process.argv.includes('--working-tree') ? 'HEAD' : 'HEAD^'
  const previousLedger = git(['show', `${comparisonRef}:cost/ledger.jsonl`])
  if (previousLedger.status === 0) {
    const prefix = previousLedger.stdout.endsWith('\n') ? previousLedger.stdout : `${previousLedger.stdout}\n`
    if (!text.startsWith(prefix)) fail(`cost/ledger.jsonl must append to, not rewrite, ${comparisonRef}`)
  }

  if (!process.argv.includes('--working-tree')) {
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

async function validateNoSecrets() {
  const listed = git(['ls-files', '--cached', '--others', '--exclude-standard'])
  if (listed.status !== 0) return
  const patterns = [
    /sk-(?:proj-)?[A-Za-z0-9_-]{20,}/,
    /OPENAI_API_KEY\s*=\s*(?!replace-me)[^\s#]+/,
  ]
  for (const path of listed.stdout.split(/\r?\n/).filter(Boolean)) {
    if (/\.pdf$/i.test(path) || /(^|\/)(ProductEntry\.json|catalog\.db)$/i.test(path) || /\.sdd\//.test(path)) {
      fail(`${path}: private source or generated Harness state must not be tracked`)
    }
    if (/\.(?:db|png|jpg|jpeg|gif|pdf)$/.test(path)) continue
    let content
    try {
      content = await readFile(resolve(root, path), 'utf8')
    } catch {
      continue
    }
    for (const pattern of patterns) if (pattern.test(content)) fail(`${path}: possible credential material`)
  }
}

try {
  await validateSdd()
  await validateConfiguration()
  await validateLedger()
  await validateNoSecrets()
} catch (error) {
  fail(error.message)
}

if (failures.length > 0) {
  console.error('Validation failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log('SDD, traceability, sources, OpenAI pricing, cost ledger, and secret checks passed.')
}
