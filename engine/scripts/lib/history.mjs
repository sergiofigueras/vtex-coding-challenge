import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, isAbsolute, relative, resolve, sep } from 'node:path'
import { readSessionText } from './cost.mjs'

const ID = /^[a-z0-9][a-z0-9-]{2,62}$/
// sdd-agent emits a 24-character ISO timestamp, a separator, and a slug capped at 60.
const RUN_ID_MAX_LENGTH = 24 + 1 + 60
const RUN_ID = new RegExp(`^[a-z0-9][a-z0-9-]{2,${RUN_ID_MAX_LENGTH - 1}}$`)
const SHA = /^[a-f0-9]{64}$/
const CREDENTIAL = /(?:sk-(?:proj-)?[A-Za-z0-9_-]{20,}|(?:api[_-]?key|authorization|password|secret|token)\s*[:=]\s*(?:Bearer\s+)?[A-Za-z0-9_+/-]{16,})/i
const PRIVATE_EXT = /\.(?:pdf|db|sqlite|sqlite3|db-journal|db-wal|db-shm)$/i
const ALLOWED = /^(?:manifest\.json|inventory\.json|runs\/[a-z0-9][a-z0-9-]{2,84}\.json|sessions\/[a-z0-9][a-z0-9-]{2,62}\.json|artifacts\/[a-f0-9]{64}|reports\/(?:cost|exclusions)\.json)$/
const EXCLUSIONS = new Set(['symlink', 'cache', 'generated-profile', 'private-reasoning', 'encrypted-replay', 'redundant-stream-chunk', 'private-artifact', 'unsupported-record'])
const digest = value => createHash('sha256').update(value).digest('hex')
const json = value => `${JSON.stringify(value, null, 2)}\n`
const locator = (root, path) => relative(root, path).split(sep).join('/')
const safeRelative = value => typeof value === 'string' && value.length > 0 && !isAbsolute(value) && !value.split('/').some(part => !part || part === '.' || part === '..') && !/[\u0000-\u001f\u007f]/.test(value)
const contained = (root, path) => { const value = relative(root, path); return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value) }
function requireId(value, label) { if (!ID.test(value ?? '')) throw new Error(`${label} must be a safe 3-63 character lower-kebab-case path segment`) }
function cutoffTime(value) { const time = Date.parse(value); if (!/^\d{4}-\d\d-\d\dT/.test(value ?? '') || Number.isNaN(time)) throw new Error('--cutoff must be an ISO-8601 timestamp'); return time }
function normalizeText(value, project, excluded = null, source = 'text') {
  if (typeof value !== 'string') throw new Error('Required text is not a string')
  if (CREDENTIAL.test(value)) throw new Error('Credential-shaped text is not exportable')
  // DSH private blocks are line-oriented and continue through blank lines and
  // Markdown content until a non-private diagnostic boundary or EOF. Preserve
  // each original line terminator so LF/CRLF/final unterminated input is stable.
  const lines = []
  const matcher = /([^\r\n]*)(\r\n|\r|\n|$)/g
  let match
  while ((match = matcher.exec(value)) && (match[1] !== '' || match[2] !== '')) lines.push({ text: match[1], ending: match[2] })
  const out = []; let removedBlocks = 0; let inPrivate = false
  for (const { text, ending } of lines) {
    if (/^dsh:\s*(?:reasoning|thinking):\s*$/i.test(text)) { inPrivate = true; removedBlocks += 1; continue }
    if (inPrivate) {
      if (/^dsh:\s+[A-Za-z][A-Za-z0-9_-]*:\s*/i.test(text)) inPrivate = false
      else continue
    }
    out.push(text + ending)
  }
  if (removedBlocks && excluded) excluded.push({ locator: source, reason: 'private-reasoning', count: removedBlocks })
  const stripped = out.join('')
  return [[project.workspaceRoot, '<WORKSPACE>'], [project.root, '<PROJECT>'], [homedir(), '<HOME>']]
    .filter(([from]) => from).sort((a, b) => b[0].length - a[0].length).reduce((outText, [from, to]) => outText.split(from).join(to), stripped)
}
function sanitize(value, project, excluded, source) {
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') return normalizeText(value, project, excluded, source)
  if (typeof value === 'number') { if (!Number.isFinite(value)) throw new Error('Non-finite value is not exportable'); return value }
  if (Array.isArray(value)) return value.flatMap((item, index) => { const sanitized = sanitize(item, project, excluded, `${source}/${index}`); return sanitized === undefined ? [] : [sanitized] })
  if (!value || typeof value !== 'object') throw new Error('Unsupported record value')
  if (typeof value.type === 'string' && /^(?:reasoning|thinking)$/i.test(value.type)) {
    excluded.push({ locator: source, reason: 'private-reasoning', count: 1 }); return undefined
  }
  const out = {}
  for (const key of Object.keys(value).sort()) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,80}$/.test(key)) throw new Error(`Unsafe record key: ${key}`)
    if (/^(?:reasoning|thinking|chain.?of.?thought)(?:Content|Text|Signature|Data)?$/i.test(key)) { excluded.push({ locator: `${source}/${key}`, reason: 'private-reasoning', count: 1 }); continue }
    if (/encrypted|replay/i.test(key)) { excluded.push({ locator: `${source}/${key}`, reason: 'encrypted-replay', count: 1 }); continue }
    if (/stream|chunk/i.test(key)) { excluded.push({ locator: `${source}/${key}`, reason: 'redundant-stream-chunk', count: 1 }); continue }
    const sanitized = sanitize(value[key], project, excluded, `${source}/${key}`)
    if (sanitized !== undefined) out[key] = sanitized
  }
  return out
}
async function regular(path, label) { const info = await lstat(path); if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) throw new Error(`${label} must be a non-hard-linked regular file`); return info }
async function files(root, missing = false, strictDirectories = false) {
  const output = []
  async function visit(path) {
    let entries; try { entries = await readdir(path, { withFileTypes: true }) } catch (error) { if (missing && error.code === 'ENOENT') return; throw error }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = resolve(path, entry.name); const info = await lstat(child)
      if (info.isSymbolicLink()) throw new Error(`Symlink encountered: ${child}`)
      if (info.isDirectory()) {
        if (strictDirectories && !['runs', 'sessions', 'artifacts', 'reports'].includes(locator(root, child))) throw new Error(`Unexpected snapshot directory: ${locator(root, child)}`)
        await visit(child)
      } else if (info.isFile()) { if (info.nlink !== 1) throw new Error(`Hard link encountered: ${child}`); output.push(child) }
      else throw new Error(`Special file encountered: ${child}`)
    }
  }
  await visit(root); return output.sort()
}
async function sourceRuns(project, cutoff) {
  const root = resolve(project.stateRoot, 'runs'); let entries
  try { entries = await readdir(root, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') return []; throw error }
  const runs = []
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || !RUN_ID.test(entry.name)) throw new Error(`Unsafe run entry: ${entry.name}`)
    const dir = resolve(root, entry.name); const manifestPath = resolve(dir, 'manifest.json'); const resultPath = resolve(dir, 'result.json')
    await regular(manifestPath, 'Run manifest')
    let manifestBytes; let manifest
    try { manifestBytes = await readFile(manifestPath); manifest = JSON.parse(manifestBytes.toString('utf8')) } catch { throw new Error(`Unreadable required run record: ${entry.name}`) }
    if (!manifest.preparedAt || Number.isNaN(Date.parse(manifest.preparedAt)) || Date.parse(manifest.preparedAt) > cutoff) continue
    if (manifest.runId !== entry.name) throw new Error(`Invalid required run record: ${entry.name}`)
    if (Object.prototype.hasOwnProperty.call(manifest, 'projectId')) {
      if (manifest.projectId !== project.id) throw new Error(`Invalid required run record: ${entry.name}`)
    } else {
      manifest = { ...manifest, projectId: project.id, provenance: { attribution: 'selected-project-legacy', originalManifestSha256: digest(manifestBytes) } }
    }
    let result = null
    try { result = JSON.parse(await readFile(resultPath, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw new Error(`Unreadable required run record: ${entry.name}`) }
    if (result === null) {
      // Preparation is a valid terminal semantic state, but only when no execution
      // evidence exists. A partially executed run must fail closed rather than being
      // silently downgraded to prepared-only.
      const executionEvidence = ['stdout.txt', 'stderr.txt', 'attempt-result.json'].some(name => existsSync(resolve(dir, name)))
      if (executionEvidence) throw new Error(`Missing required run result: ${entry.name}`)
      runs.push({ id: entry.name, dir, manifest, result: null, preparedOnly: true }); continue
    }
    if (!result || typeof result !== 'object') throw new Error(`Invalid required run record: ${entry.name}`)
    runs.push({ id: entry.name, dir, manifest, result, preparedOnly: false })
  }
  return runs
}
function sessionIdFromText(file, text) {
  const parent = basename(resolve(file, '..'))
  const rows = []
  for (const line of text.split(/\r?\n/)) if (line.trim()) rows.push(JSON.parse(line))
  const first = rows[0]
  const headerId = first?.type === 'session' && typeof first.id === 'string' ? first.id : null
  const parentId = parent !== 'sessions' ? parent : null
  const eventIds = rows.flatMap(row => [row.sessionId, row.event?.sessionId]).filter(value => value !== undefined)
  const sources = [headerId, parentId, ...eventIds].filter(value => value !== null)
  if (!sources.length) throw new Error('Missing session identity')
  if (sources.some(value => typeof value !== 'string' || !ID.test(value))) throw new Error('Unsafe session ID')
  if (new Set(sources).size !== 1) throw new Error('Session identity mismatch')
  return sources[0]
}
function semanticEvent(row, project, sequence, excluded, source) {
  const event = row?.type === 'session_event' && row.event ? row.event : row
  if (!event || typeof event !== 'object' || typeof event.type !== 'string') throw new Error(`Unknown required session record shape: ${source}`)
  if (/reasoning/i.test(event.type)) { excluded.push({ locator: source, reason: 'private-reasoning', count: 1 }); return null }
  if (/replay|encrypted/i.test(event.type)) { excluded.push({ locator: source, reason: 'encrypted-replay', count: 1 }); return null }
  if (/stream|chunk/i.test(event.type)) { excluded.push({ locator: source, reason: 'redundant-stream-chunk', count: 1 }); return null }
  const allowed = new Set(['session', 'permission/preset', 'sandbox/mode', 'approval/policy', 'agent/inbox/spliced', 'turn/start', 'turn/end', 'step/start', 'step/end', 'user/message', 'assistant/message', 'tool/call', 'tool/result', 'todo/write', 'goal/change', 'llm/retry', 'llm/retry-started', 'session/title', 'session/title-llm-request', 'request/header', 'request/context'])
  if (!allowed.has(event.type)) throw new Error(`Unknown required session event: ${event.type}`)
  if (event.type === 'agent/inbox/spliced' || event.type === 'session/title-llm-request') { excluded.push({ locator: source, reason: 'unsupported-record', count: 1 }); return null }
  return { sequence: Number.isSafeInteger(event.seq) ? event.seq : sequence, type: event.type, data: sanitize(event.data ?? {}, project, excluded, source) }
}
function linkedSessionPaths(project, runs, ledger) {
  const runIds = new Set(runs.map(run => run.id)); const paths = new Set()
  for (const entry of ledger) if (entry.projectId === project.id && runIds.has(entry.runId)) {
    if (!Array.isArray(entry.sourceSessionFiles)) continue
    for (const original of entry.sourceSessionFiles) {
      const marker = '.sdd/dsh-home/sessions/'; const index = typeof original === 'string' ? original.indexOf(marker) : -1
      const source = index >= 0 ? original.slice(index) : original
      if (!safeRelative(source) || !source.startsWith(marker)) throw new Error(`Unsafe linked session path: ${original}`)
      const path = resolve(project.root, source); if (!contained(project.stateRoot, path)) throw new Error(`Linked session escapes state: ${original}`); paths.add(path)
    }
  }
  return [...paths].sort()
}
async function sessionsForRuns(project, runs, ledger, exclusions) {
  const linked = linkedSessionPaths(project, runs, ledger)
  if (runs.length && linked.length === 0) throw new Error('Complete runs have no unambiguous linked session records')
  const sessions = []
  for (const file of linked) {
    await regular(file, 'Linked session')
    let text; try { text = await readSessionText(file) } catch { throw new Error(`Unreadable linked session: ${locator(project.root, file)}`) }
    let id; try { id = sessionIdFromText(file, text) } catch { throw new Error(`Unreadable linked session: ${locator(project.root, file)}`) }
    const events = []
    for (const [index, line] of text.split(/\r?\n/).entries()) if (line.trim()) {
      let row; try { row = JSON.parse(line) } catch { throw new Error(`Unreadable session record: ${locator(project.root, file)}`) }
      const event = semanticEvent(row, project, index + 1, exclusions, `${locator(project.root, file)}:${index + 1}`); if (event) events.push(event)
    }
    sessions.push({ id, source: locator(project.root, file), events })
  }
  if (new Set(sessions.map(session => session.id)).size !== sessions.length) throw new Error('Session ID collision')
  return sessions.sort((a, b) => a.id.localeCompare(b.id))
}
async function configuredInputs(project) {
  let manifest, generated
  try { manifest = JSON.parse(await readFile(project.sourcesPath, 'utf8')); generated = JSON.parse(await readFile(resolve(project.stateRoot, 'inputs/inventory.json'), 'utf8')) } catch { throw new Error('Unreadable source inventory') }
  if (!Array.isArray(manifest.sources) || !Array.isArray(generated.sources)) throw new Error('Invalid source inventory')
  const rows = manifest.sources.map(source => {
    const row = generated.sources.find(item => item && item.id === source.id)
    if (!row || row.sourceUrl !== source.url || row.localFile !== source.fileName || row.bytes !== source.bytes || row.sha256 !== source.sha256 || !safeRelative(source.fileName) || !SHA.test(source.sha256) || !Number.isSafeInteger(source.bytes) || source.bytes < 0 || typeof source.url !== 'string' || CREDENTIAL.test(source.url)) throw new Error(`Mismatched configured source fixture: ${source.id}`)
    return { id: String(source.id), name: source.fileName, bytes: source.bytes, sha256: source.sha256, provenance: source.url }
  })
  if (new Set(rows.map(row => row.id)).size !== rows.length || generated.sources.length !== rows.length) throw new Error('Mismatched configured source inventory')
  return rows
}
async function discoverExclusions(project) {
  const output = []; const root = project.stateRoot; const inputs = await configuredInputs(project); const expected = new Map(inputs.map(row => [row.name, row])); const inputRoot = resolve(root, 'inputs')
  let inputEntries = []; try { inputEntries = await readdir(inputRoot, { withFileTypes: true }) } catch (error) { if (error.code !== 'ENOENT') throw error }
  for (const entry of inputEntries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'inventory.json') continue
    const path = resolve(inputRoot, entry.name); const source = locator(root, path); const row = expected.get(entry.name); const info = await lstat(path)
    if (!row || !info.isFile() || info.isSymbolicLink()) throw new Error(`Unknown or unsafe input fixture: ${source}`)
    const bytes = await readFile(path); if (bytes.length !== row.bytes || digest(bytes) !== row.sha256) throw new Error(`Mismatched configured source fixture: ${source}`)
    output.push({ locator: source, reason: 'private-artifact', count: 1, bytes: row.bytes, sha256: row.sha256 })
  }
  for (const row of inputs) if (!inputEntries.some(entry => entry.name === row.name)) throw new Error(`Missing configured source fixture: ${row.name}`)
  async function visit(dir) {
    let entries; try { entries = await readdir(dir, { withFileTypes: true }) } catch (error) { if (error.code === 'ENOENT') return; throw error }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.name === 'history' || entry.name === 'inputs') continue
      const path = resolve(dir, entry.name); const source = locator(root, path); const info = await lstat(path)
      if (info.isSymbolicLink()) { if (source.startsWith('generated-profile/') || source.startsWith('dsh-home/profiles/')) output.push({ locator: source, reason: 'symlink', count: 1 }); else throw new Error(`Symlink encountered: ${source}`); continue }
      if (info.isDirectory()) { if (/cache/i.test(entry.name)) output.push({ locator: source, reason: 'cache', count: 1 }); else if (/profile/i.test(entry.name)) { output.push({ locator: source, reason: 'generated-profile', count: 1 }); await visit(path) } else await visit(path); continue }
      if (!info.isFile()) { output.push({ locator: source, reason: 'unsupported-record', count: 1 }); continue }
      if (PRIVATE_EXT.test(entry.name)) throw new Error(`Private artifact is not exportable: ${source}`)
      if (/replay|encrypted/i.test(entry.name)) output.push({ locator: source, reason: 'encrypted-replay', count: 1 })
    }
  }
  await visit(root); return output
}
async function inventory(project) {
  const sources = await configuredInputs(project)
  return { schemaVersion: '1.0', projectId: project.id, sources: sources.map(source => ({ id: source.id, name: source.name, classification: 'private-source-not-exported', bytes: source.bytes, sha256: source.sha256, provenance: source.provenance })).sort((a, b) => a.id.localeCompare(b.id)) }
}
function costReport(project, runs, ledger) {
  const ids = new Set(runs.map(run => run.id)); const entries = ledger.filter(entry => entry.projectId === project.id && ids.has(entry.runId)).map(entry => ({ runId: entry.runId, changeId: entry.changeId, measurement: entry.measurement, actualUsd: typeof entry.actualUsd === 'number' ? entry.actualUsd : null, estimatedUsd: typeof entry.estimatedUsd === 'number' ? entry.estimatedUsd : null, accountingStatus: entry.accountingStatus ?? (entry.actualUsd === null ? 'unavailable' : 'reported') })).sort((a, b) => `${a.runId}:${a.changeId}`.localeCompare(`${b.runId}:${b.changeId}`))
  return { schemaVersion: '1.0', projectId: project.id, entries, knownActualUsd: entries.reduce((total, entry) => total + (entry.actualUsd ?? 0), 0), unavailableEntries: entries.filter(entry => entry.actualUsd === null).length }
}
async function ledgerAt(engineRoot) { try { return (await readFile(resolve(engineRoot, 'cost/ledger.jsonl'), 'utf8')).split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)) } catch { throw new Error('Unreadable cost ledger') } }
function exclusionReport(items) { return { schemaVersion: '1.0', exclusions: items.sort((a, b) => `${a.locator}:${a.reason}`.localeCompare(`${b.locator}:${b.reason}`)) } }
async function artifact(stage, bytes, source, project, map, excluded) { const normalized = Buffer.from(normalizeText(bytes.toString('utf8'), project, excluded, source)); const sha256 = digest(normalized); if (!map.has(sha256)) { await writeFile(resolve(stage, 'artifacts', sha256), normalized, { flag: 'wx' }); map.set(sha256, true) }; return { path: `artifacts/${sha256}`, sha256, bytes: normalized.length, source: normalizeText(source, project) } }
export async function createHistory(engineRoot, project, { snapshot, cutoff }) {
  requireId(snapshot, '--snapshot'); const cutoffMs = cutoffTime(cutoff); const history = resolve(project.stateRoot, 'history'); const destination = resolve(history, snapshot); if (!contained(history, destination)) throw new Error('Snapshot escapes history root')
  try { await lstat(destination); throw new Error(`Snapshot already exists: ${snapshot}`) } catch (error) { if (error.code !== 'ENOENT') throw error }
  const stage = resolve(history, `.tmp-${snapshot}-${process.pid}`); await rm(stage, { recursive: true, force: true }); await mkdir(resolve(stage, 'runs'), { recursive: true }); await mkdir(resolve(stage, 'sessions')); await mkdir(resolve(stage, 'artifacts')); await mkdir(resolve(stage, 'reports'))
  try {
    const runs = await sourceRuns(project, cutoffMs); const ledger = await ledgerAt(engineRoot); const excluded = await discoverExclusions(project); const sessions = await sessionsForRuns(project, runs, ledger, excluded); const artifacts = new Map()
    for (const run of runs) {
      const record = { schemaVersion: '1.0', runId: run.id, source: `runs/${run.id}`, state: run.preparedOnly ? 'prepared-only' : 'executed', manifest: sanitize(run.manifest, project, excluded, `runs/${run.id}/manifest.json`), result: run.result ? sanitize(run.result, project, excluded, `runs/${run.id}/result.json`) : null, artifacts: [] }
      if (!run.preparedOnly && ['prompt.md', 'stdout.txt', 'stderr.txt'].some(name => !existsSync(resolve(run.dir, name)))) throw new Error(`Missing required execution artifact: ${run.id}`)
      for (const name of ['prompt.md', 'stdout.txt', 'stderr.txt', 'session']) { const path = resolve(run.dir, name); try { await regular(path, name); record.artifacts.push({ name, ...(await artifact(stage, await readFile(path), `runs/${run.id}/${name}`, project, artifacts, excluded)) }) } catch (error) { if (error.code !== 'ENOENT') throw error; record.artifacts.push({ name, path: null, sha256: null, bytes: null, source: `runs/${run.id}/${name}` }) } }
      await writeFile(resolve(stage, 'runs', `${run.id}.json`), json(record), { flag: 'wx' })
    }
    for (const session of sessions) await writeFile(resolve(stage, 'sessions', `${session.id}.json`), json({ schemaVersion: '1.0', sessionId: session.id, source: normalizeText(session.source, project), events: session.events }), { flag: 'wx' })
    await writeFile(resolve(stage, 'inventory.json'), json(await inventory(project)), { flag: 'wx' }); await writeFile(resolve(stage, 'reports', 'exclusions.json'), json(exclusionReport(excluded)), { flag: 'wx' }); await writeFile(resolve(stage, 'reports', 'cost.json'), json(costReport(project, runs, ledger)), { flag: 'wx' })
    const entries = []; for (const path of await files(stage)) { const pathName = locator(stage, path); entries.push({ path: pathName, sha256: digest(await readFile(path)), bytes: (await stat(path)).size }) }
    const manifest = { schemaVersion: '1.0', projectId: project.id, snapshot, cutoff, files: entries, coverage: { runIds: runs.map(run => run.id), sessionIds: sessions.map(session => session.id) }, manifestSha256: null }; manifest.manifestSha256 = digest(json(manifest)); await writeFile(resolve(stage, 'manifest.json'), json(manifest), { flag: 'wx' }); await rename(stage, destination); return destination
  } catch (error) { await rm(stage, { recursive: true, force: true }); throw error }
}
export async function validateHistory(engineRoot, project, { snapshot }) {
  requireId(snapshot, '--snapshot'); const root = resolve(project.stateRoot, 'history', snapshot); if (!contained(resolve(project.stateRoot, 'history'), root)) throw new Error('Snapshot escapes history root'); const manifestPath = resolve(root, 'manifest.json'); await regular(manifestPath, 'Snapshot manifest')
  let manifest; try { manifest = JSON.parse(await readFile(manifestPath, 'utf8')) } catch { throw new Error('Unreadable snapshot manifest') }
  if (manifest.schemaVersion !== '1.0' || manifest.projectId !== project.id || manifest.snapshot !== snapshot || !Array.isArray(manifest.files) || !Array.isArray(manifest.coverage?.runIds) || !Array.isArray(manifest.coverage?.sessionIds)) throw new Error('Invalid snapshot manifest')
  const copy = { ...manifest, manifestSha256: null }; if (digest(json(copy)) !== manifest.manifestSha256) throw new Error('Snapshot manifest is non-deterministic or modified')
  const expected = new Map(); for (const entry of manifest.files) { if (!entry || !ALLOWED.test(entry.path) || !SHA.test(entry.sha256) || !Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || expected.has(entry.path)) throw new Error('Invalid manifest file mapping'); expected.set(entry.path, entry) }
  const required = new Set(['inventory.json', 'reports/cost.json', 'reports/exclusions.json', ...manifest.coverage.runIds.map(id => `runs/${id}.json`), ...manifest.coverage.sessionIds.map(id => `sessions/${id}.json`), ...[...expected.keys()].filter(path => path.startsWith('artifacts/'))])
  for (const path of required) if (!expected.has(path)) throw new Error(`Missing required published artifact: ${path}`)
  if (expected.has('manifest.json')) throw new Error('Manifest must not self-list')
  expected.set('manifest.json', { path: 'manifest.json', sha256: digest(await readFile(manifestPath)), bytes: (await stat(manifestPath)).size })
  const actual = await files(root, false, true)
  for (const path of actual) { const name = locator(root, path); const entry = expected.get(name); if (!entry) throw new Error(`Unexpected snapshot output: ${name}`); if (entry.sha256 !== digest(await readFile(path)) || entry.bytes !== (await stat(path)).size) throw new Error(`Snapshot file modified: ${name}`) }
  if (actual.length !== expected.size) throw new Error('Snapshot output is missing a manifested file')
  const scan = async (path, label, ignoredRunId = null) => { const text = await readFile(path, 'utf8'); if (CREDENTIAL.test(text) || /^dsh:\s*(?:reasoning|thinking):\s*$/im.test(text)) throw new Error(`Unsafe ${label}`); const value = JSON.parse(text); const safety = structuredClone(value); delete safety.runId; delete safety.source; if (safety.manifest && typeof safety.manifest === 'object') { delete safety.manifest.runId; delete safety.manifest.source } if (/(?:["'](?:reasoning|thinking|chain.?of.?thought|encrypted|replay|stream|chunk)(?:Content|Text|Signature|Data)?["']\s*:)/i.test(JSON.stringify(safety).split(ignoredRunId ?? '\u0000').join(''))) throw new Error(`Unsafe ${label}`); return value }
  for (const entry of manifest.files.filter(item => item.path.startsWith('artifacts/'))) { const text = await readFile(resolve(root, entry.path), 'utf8'); if (/^dsh:\s*(?:reasoning|thinking):\s*$/im.test(text)) throw new Error(`Unsafe published artifact: ${entry.path}`) }
  for (const runId of manifest.coverage.runIds) { if (!RUN_ID.test(runId)) throw new Error(`Unsafe covered run ID: ${runId}`); const record = await scan(resolve(root, 'runs', `${runId}.json`), `semantic run record: ${runId}`, runId); if (record.runId !== runId || !safeRelative(record.source)) throw new Error(`Invalid semantic run record: ${runId}`) }
  for (const sessionId of manifest.coverage.sessionIds) { if (!ID.test(sessionId)) throw new Error(`Unsafe covered session ID: ${sessionId}`); const record = await scan(resolve(root, 'sessions', `${sessionId}.json`), `semantic session record: ${sessionId}`); if (record.sessionId !== sessionId || !safeRelative(record.source) || !Array.isArray(record.events)) throw new Error(`Invalid semantic session record: ${sessionId}`) }
  const exclusions = JSON.parse(await readFile(resolve(root, 'reports/exclusions.json'), 'utf8')); if (!Array.isArray(exclusions.exclusions) || exclusions.exclusions.some(entry => !EXCLUSIONS.has(entry.reason) || !safeRelative(entry.locator) || !Number.isSafeInteger(entry.count) || entry.count <= 0)) throw new Error('Invalid exclusions report')
  const cost = JSON.parse(await readFile(resolve(root, 'reports/cost.json'), 'utf8')); if (cost.projectId !== project.id || !Array.isArray(cost.entries) || cost.entries.some(entry => !manifest.coverage.runIds.includes(entry.runId))) throw new Error('Invalid project cost report')
  const derivedCost = costReport(project, manifest.coverage.runIds.map(id => ({ id })), await ledgerAt(engineRoot)); if (json(cost) !== json(derivedCost)) throw new Error('Project cost report is not derived from the ledger')
  return root
}
