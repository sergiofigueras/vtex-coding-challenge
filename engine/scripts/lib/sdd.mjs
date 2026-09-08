import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { readJson } from './files.mjs'

export async function loadSdd(project) {
  const manifest = await readJson(project.manifestPath)
  return { manifest, byId: new Map(manifest.specifications.map(spec => [spec.id, spec])) }
}

export function orderedClosure(requestedIds, byId) {
  const visiting = new Set()
  const visited = new Set()
  const result = []
  function visit(id) {
    const spec = byId.get(id)
    if (!spec) throw new Error(`Unknown specification: ${id}`)
    if (visiting.has(id)) throw new Error(`Specification dependency cycle at ${id}`)
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of spec.dependsOn) visit(dependency)
    visiting.delete(id)
    visited.add(id)
    result.push(spec)
  }
  for (const id of requestedIds) visit(id)
  return result
}

export async function buildAgentPrompt(project, changeId, requestedIds) {
  const { byId } = await loadSdd(project)
  const specs = orderedClosure(requestedIds, byId)
  const requested = new Set(requestedIds)
  const lines = [
    '# SDD delivery task',
    '',
    `Project: ${project.id}`,
    `Change ID: ${changeId}`,
    `Requested specifications: ${requestedIds.join(', ')}`,
    '',
    'Use the repository skill `sdd-delivery` and obey AGENTS.md.',
    'Implement only the requested specification(s). Read dependencies for context but do not expand their implementation scope unless required by a stated acceptance criterion.',
    'Do not commit, push, or expose credentials. The outer runner records model cost after the Harness process exits.',
    'Run the narrow checks while iterating, then `npm run check` before reporting completion.',
    'Update the requested spec status and `docs/sdd/traceability.json` only when evidence exists.',
    '',
    'Specification reading order:',
  ]
  for (const spec of specs) {
    lines.push(`- ${spec.id}: ${spec.path}${requested.has(spec.id) ? ' (IMPLEMENT)' : ' (CONTEXT ONLY)'}`)
  }
  lines.push('', 'Deliver a concise result naming changed files, proof commands, unresolved decisions, and the change ID.')
  return `${lines.join('\n')}\n`
}

export function estimatedPromptTokens(prompt, fixedOverheadTokens = 18000) {
  return Math.ceil(Buffer.byteLength(prompt, 'utf8') / 4) + fixedOverheadTokens
}

export async function specText(project, spec) {
  return readFile(resolve(project.root, spec.path), 'utf8')
}
