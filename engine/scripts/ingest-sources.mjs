#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { mkdir, readFile } from 'node:fs/promises'
import { basename, resolve } from 'node:path'
import { atomicWrite, readJson, sha256 } from './lib/files.mjs'
import { loadProject, parseProjectArgs } from './lib/project.mjs'

export function profileJson(value, profile = {}) {
  const rootType = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value
  if (profile.expectedRoot && profile.expectedRoot !== rootType) {
    throw new Error(`Expected the JSON source root to be ${profile.expectedRoot}, received ${rootType}`)
  }
  if (!Array.isArray(value)) {
    if ((profile.metrics ?? []).length > 0) throw new Error('JSON profile metrics require an array root')
    if (value === null || typeof value !== 'object') return { rootType }
    const fields = Object.keys(value).sort()
    return {
      rootType,
      fields,
      types: Object.fromEntries(fields.map(field => [field, value[field] === null ? 'null' : typeof value[field]])),
      nullFields: fields.filter(field => value[field] === null),
    }
  }
  const objectRows = value.every(row => row !== null && typeof row === 'object' && !Array.isArray(row))
  if (!objectRows) {
    if ((profile.metrics ?? []).length > 0) throw new Error('JSON profile metrics require an array of objects')
    return {
      rootType,
      rowCount: value.length,
      itemTypes: [...new Set(value.map(row => Array.isArray(row) ? 'array' : row === null ? 'null' : typeof row))].sort(),
    }
  }
  const fields = [...new Set(value.flatMap(row => Object.keys(row)))].sort()
  const nullCounts = Object.fromEntries(fields.map(field => [field, value.filter(row => row[field] === null).length]))
  const types = Object.fromEntries(fields.map(field => [field, [...new Set(value.map(row => row[field] === null ? 'null' : typeof row[field]))].sort()]))
  const result = {
    rootType,
    rowCount: value.length,
    fields,
    types,
    nullCounts,
  }
  for (const metric of profile.metrics ?? []) {
    if (Object.hasOwn(result, metric.name)) throw new Error(`JSON profile metric conflicts with a built-in field: ${metric.name}`)
    for (const field of metric.fields) if (!fields.includes(field)) throw new Error(`JSON profile metric ${metric.name} references missing field ${field}`)
    const keys = value.map(row => JSON.stringify(metric.fields.map(field => row[field])))
    if (metric.kind === 'distinct-count') result[metric.name] = new Set(keys).size
    else if (metric.kind === 'duplicate-count') result[metric.name] = keys.length - new Set(keys).size
    else throw new Error(`Unsupported JSON profile metric: ${metric.kind}`)
  }
  return result
}

function profileSqlite(path) {
  const program = String.raw`
import json, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
tables = []
for name, sql in db.execute("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name"):
    quoted = '"' + name.replace('"', '""') + '"'
    count = db.execute(f"SELECT COUNT(*) FROM {quoted}").fetchone()[0]
    columns = [dict(zip(('cid','name','type','notNull','defaultValue','primaryKey'), row)) for row in db.execute(f"PRAGMA table_info({quoted})")]
    foreign_keys = [dict(zip(('id','seq','table','from','to','onUpdate','onDelete','match'), row)) for row in db.execute(f"PRAGMA foreign_key_list({quoted})")]
    tables.append({'name': name, 'sql': sql, 'rowCount': count, 'columns': columns, 'foreignKeys': foreign_keys})
print(json.dumps({'tables': tables}, separators=(',', ':')))
`
  for (const python of ['python3', 'python']) {
    const result = spawnSync(python, ['-c', program, path], { encoding: 'utf8' })
    if (result.status === 0) return JSON.parse(result.stdout)
    if (result.error?.code === 'ENOENT') continue
    throw new Error(`SQLite inspection failed: ${result.stderr || result.error?.message}`)
  }
  throw new Error('Python 3 is required to inspect SQLite sources')
}

function parseArgs(argv, project) {
  const options = {
    refresh: false,
    manifest: project.descriptor.sourcesManifest,
    output: `${project.descriptor.stateDirectory}/inputs`,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--refresh') options.refresh = true
    else if (argument === '--manifest') options.manifest = argv[++index]
    else if (argument === '--output') options.output = argv[++index]
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

async function download(source, target, refresh) {
  let bytes
  try {
    bytes = await readFile(target)
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  if (!bytes || refresh) {
    const response = await fetch(source.url, { redirect: 'follow' })
    if (!response.ok) throw new Error(`${source.id}: download failed with HTTP ${response.status}`)
    bytes = Buffer.from(await response.arrayBuffer())
    await atomicWrite(target, bytes)
  }
  const digest = await sha256(bytes)
  if (digest !== source.sha256) throw new Error(`${source.id}: SHA-256 mismatch; expected ${source.sha256}, received ${digest}`)
  if (bytes.length !== source.bytes) throw new Error(`${source.id}: byte count mismatch; expected ${source.bytes}, received ${bytes.length}`)
  return bytes
}

export async function ingest(root, options) {
  const manifest = await readJson(resolve(root, options.manifest))
  const outputRoot = resolve(root, options.output)
  await mkdir(outputRoot, { recursive: true })
  const records = []
  for (const source of manifest.sources) {
    const target = resolve(outputRoot, basename(source.fileName))
    const bytes = await download(source, target, options.refresh)
    let profile
    if (source.kind === 'json') profile = profileJson(JSON.parse(bytes.toString('utf8')), source.profile)
    else if (source.kind === 'sqlite') profile = profileSqlite(target)
    else throw new Error(`${source.id}: unsupported source kind ${source.kind}`)
    records.push({
      id: source.id,
      kind: source.kind,
      sourceUrl: source.url,
      localFile: basename(target),
      sha256: source.sha256,
      bytes: bytes.length,
      profile,
    })
  }
  const inventory = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    manifest: options.manifest,
    sources: records,
  }
  await atomicWrite(resolve(outputRoot, 'inventory.json'), `${JSON.stringify(inventory, null, 2)}\n`)
  return inventory
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const engineRoot = resolve(import.meta.dirname, '..')
  try {
    const projectArgs = parseProjectArgs(process.argv.slice(2))
    const project = await loadProject(engineRoot, projectArgs.projectId)
    const options = parseArgs(projectArgs.remaining, project)
    const inventory = await ingest(project.root, options)
    for (const source of inventory.sources) {
      console.log(`${source.id}: verified ${source.bytes} bytes (${source.sha256.slice(0, 12)}...)`)
    }
    console.log(`Private source inventory written under ${resolve(project.root, options.output)}`)
  } catch (error) {
    console.error(`Source ingestion failed: ${error.message}`)
    process.exitCode = 1
  }
}
