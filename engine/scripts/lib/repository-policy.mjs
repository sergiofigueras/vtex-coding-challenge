import { readFile } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { sha256 } from './files.mjs'

const CHANGE_ID_PATTERN = /^[a-z0-9][a-z0-9-]{4,80}$/
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/

function exactKeys(value, allowed, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`)
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label}: unexpected field ${key}`)
}

export function parsePublicArtifactManifest(manifest) {
  exactKeys(manifest, ['schemaVersion', 'artifacts'], 'public artifacts manifest')
  if (manifest.schemaVersion !== '1.0') throw new Error('public artifacts manifest: unsupported schemaVersion')
  if (!Array.isArray(manifest.artifacts)) throw new Error('public artifacts manifest: artifacts must be an array')
  const byPath = new Map()
  for (const artifact of manifest.artifacts) {
    exactKeys(artifact, ['path', 'kind', 'bytes', 'sha256'], 'public artifact')
    if (typeof artifact.path !== 'string' || artifact.path === '' || isAbsolute(artifact.path) || artifact.path.includes('\\') || artifact.path.split('/').includes('..')) {
      throw new Error('public artifact path must be repository-relative and normalized')
    }
    if (!artifact.path.toLowerCase().endsWith('.pdf')) throw new Error(`${artifact.path}: public artifact must be a PDF`)
    if (artifact.kind !== 'generated-presentation') throw new Error(`${artifact.path}: unsupported public artifact kind`)
    if (!Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0) throw new Error(`${artifact.path}: invalid byte length`)
    if (!/^[a-f0-9]{64}$/.test(artifact.sha256 ?? '')) throw new Error(`${artifact.path}: invalid SHA-256`)
    if (byPath.has(artifact.path)) throw new Error(`${artifact.path}: duplicate public artifact`)
    byPath.set(artifact.path, artifact)
  }
  return byPath
}

export async function verifyPublicArtifacts(workspaceRoot, trackedPaths, manifest) {
  const byPath = parsePublicArtifactManifest(manifest)
  const tracked = new Set(trackedPaths)
  for (const [path, artifact] of byPath) {
    if (!tracked.has(path)) throw new Error(`${path}: allowlisted public artifact is not tracked`)
    const bytes = await readFile(resolve(workspaceRoot, path))
    if (bytes.length !== artifact.bytes) throw new Error(`${path}: public artifact byte length changed`)
    if (await sha256(bytes) !== artifact.sha256) throw new Error(`${path}: public artifact SHA-256 changed`)
  }
  return byPath
}

export function isProhibitedTrackedArtifact(path, publicArtifacts, privateSourceNames, allowedHistory) {
  if (/\.pdf$/i.test(path)) return !publicArtifacts.has(path)
  if (/\.(?:db|sqlite|sqlite3)$/i.test(path)) return true
  if (privateSourceNames.has(basename(path))) return true
  return allowedHistory === false
}

export function parseLegacyCommitCostManifest(manifest) {
  exactKeys(manifest, ['schemaVersion', 'commits'], 'legacy commit cost manifest')
  if (manifest.schemaVersion !== '1.0') throw new Error('legacy commit cost manifest: unsupported schemaVersion')
  exactKeys(manifest.commits, Object.keys(manifest.commits ?? {}), 'legacy commit cost commits')
  const result = new Map()
  for (const [sha, correction] of Object.entries(manifest.commits)) {
    if (!COMMIT_SHA_PATTERN.test(sha)) throw new Error(`legacy commit correction has invalid SHA: ${sha}`)
    exactKeys(correction, ['observedTrailer', 'changeId', 'reason'], `legacy commit correction ${sha}`)
    if (typeof correction.observedTrailer !== 'string' || correction.observedTrailer.trim() !== correction.observedTrailer || correction.observedTrailer === '') {
      throw new Error(`legacy commit correction ${sha}: observedTrailer must be a non-empty exact value`)
    }
    if (CHANGE_ID_PATTERN.test(correction.observedTrailer)) throw new Error(`legacy commit correction ${sha}: observed trailer is already valid`)
    if (!CHANGE_ID_PATTERN.test(correction.changeId ?? '')) throw new Error(`legacy commit correction ${sha}: invalid changeId`)
    if (typeof correction.reason !== 'string' || correction.reason.trim() === '') throw new Error(`legacy commit correction ${sha}: reason is required`)
    result.set(sha, correction)
  }
  return result
}

export function resolveCommitCostEntry(sha, body, knownChangeIds, legacyCorrections) {
  const strict = /^Cost-Entry:\s*([a-z0-9][a-z0-9-]{4,80})\s*$/mi.exec(body)
  let changeId = strict?.[1]
  if (!changeId) {
    const observed = /^Cost-Entry:\s*(.*?)\s*$/mi.exec(body)?.[1]
    const correction = legacyCorrections.get(sha)
    if (!correction || correction.observedTrailer !== observed) {
      throw new Error(`commit ${sha.slice(0, 12)}: missing or invalid Cost-Entry trailer`)
    }
    changeId = correction.changeId
  }
  if (!knownChangeIds.has(changeId)) throw new Error(`commit ${sha.slice(0, 12)}: unknown Cost-Entry ${changeId}`)
  return changeId
}
