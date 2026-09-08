import { readdir, realpath } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path'
import { readJson } from './files.mjs'

export const PROJECT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/

function assertRelativePath(value, label) {
  if (typeof value !== 'string' || value.length === 0 || isAbsolute(value)) {
    throw new Error(`${label} must be a non-empty relative path`)
  }
  const normalized = relative('.', resolve('.', value))
  if (normalized === '..' || normalized.startsWith(`..${sep}`)) {
    throw new Error(`${label} must stay inside the project`)
  }
  return value
}

function isContained(root, target) {
  const location = relative(root, target)
  return location !== '..' && !location.startsWith(`..${sep}`) && !isAbsolute(location)
}

export async function resolveContainedPath(projectRoot, path, label, { allowMissing = false } = {}) {
  const target = resolve(projectRoot, path)
  let existing = target
  while (true) {
    try {
      const actual = await realpath(existing)
      if (!isContained(projectRoot, actual)) throw new Error(`${label} resolves outside the project`)
      return existing === target ? actual : target
    } catch (error) {
      if (error.code !== 'ENOENT' || !allowMissing) throw error
      const parent = dirname(existing)
      if (parent === existing) throw error
      existing = parent
    }
  }
}

export function parseProjectArgs(argv, { required = true } = {}) {
  const remaining = []
  let projectId
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] !== '--project') {
      remaining.push(argv[index])
      continue
    }
    if (projectId !== undefined) throw new Error('--project may be specified only once')
    projectId = argv[++index]
    if (!projectId) throw new Error('--project requires a value')
  }
  if (required && !projectId) throw new Error('--project <project-id> is required')
  if (projectId && !PROJECT_ID_PATTERN.test(projectId)) {
    throw new Error('--project must be a 3-63 character lower-kebab-case ID')
  }
  return { projectId, remaining }
}

export async function loadProject(engineRoot, projectId) {
  if (!PROJECT_ID_PATTERN.test(projectId ?? '')) throw new Error(`Invalid project ID: ${projectId ?? '<missing>'}`)
  const workspaceRoot = resolve(engineRoot, '..')
  const projectsRoot = resolve(workspaceRoot, 'projects')
  const projectRoot = resolve(projectsRoot, projectId)
  const actualProjectsRoot = await realpath(projectsRoot)
  const actualProjectRoot = await realpath(projectRoot).catch(error => {
    if (error.code === 'ENOENT') throw new Error(`Unknown project ${projectId}; expected ${projectRoot}`)
    throw error
  })
  if (!isContained(actualProjectsRoot, actualProjectRoot)) {
    throw new Error(`Project ${projectId} resolves outside ${projectsRoot}`)
  }
  const descriptorPath = resolve(actualProjectRoot, 'project.json')
  const descriptor = await readJson(descriptorPath).catch(error => {
    if (error.code === 'ENOENT') throw new Error(`Unknown project ${projectId}; expected ${descriptorPath}`)
    throw error
  })
  if (descriptor.schemaVersion !== '1.0') throw new Error(`${projectId}: unsupported project schemaVersion`)
  if (descriptor.id !== projectId) throw new Error(`${projectId}: project.json id must match its directory`)
  if (typeof descriptor.name !== 'string' || descriptor.name.trim() === '') throw new Error(`${projectId}: project name is required`)
  const allowed = ['schemaVersion', 'id', 'name', 'sddManifest', 'traceability', 'sourcesManifest', 'stateDirectory']
  for (const key of Object.keys(descriptor)) if (!allowed.includes(key)) throw new Error(`${projectId}: unexpected project.json field ${key}`)
  for (const field of ['sddManifest', 'traceability', 'sourcesManifest', 'stateDirectory']) {
    assertRelativePath(descriptor[field], `${projectId}: ${field}`)
  }
  const manifestPath = await resolveContainedPath(actualProjectRoot, descriptor.sddManifest, `${projectId}: sddManifest`)
  const traceabilityPath = await resolveContainedPath(actualProjectRoot, descriptor.traceability, `${projectId}: traceability`)
  const sourcesPath = await resolveContainedPath(actualProjectRoot, descriptor.sourcesManifest, `${projectId}: sourcesManifest`)
  const stateRoot = await resolveContainedPath(actualProjectRoot, descriptor.stateDirectory, `${projectId}: stateDirectory`, { allowMissing: true })
  return {
    id: projectId,
    name: descriptor.name,
    descriptor,
    engineRoot,
    workspaceRoot,
    projectsRoot,
    root: actualProjectRoot,
    manifestPath,
    traceabilityPath,
    sourcesPath,
    stateRoot,
  }
}

export async function discoverProjects(engineRoot) {
  const projectsRoot = resolve(engineRoot, '..', 'projects')
  const entries = await readdir(projectsRoot, { withFileTypes: true }).catch(error => {
    if (error.code === 'ENOENT') return []
    throw error
  })
  for (const entry of entries) {
    if (entry.isSymbolicLink()) throw new Error(`Project entries may not be symlinks: ${entry.name}`)
    if (entry.isDirectory() && !PROJECT_ID_PATTERN.test(entry.name)) throw new Error(`Invalid project directory name: ${entry.name}`)
  }
  const ids = entries.filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  const projects = []
  for (const id of ids) projects.push(await loadProject(engineRoot, id))
  return projects
}

export function resolveDshExecutable(engineRoot) {
  const candidates = [
    resolve(engineRoot, 'node_modules/.bin/dsh'),
    resolve(engineRoot, '../node_modules/.bin/dsh'),
  ]
  const executable = candidates.find(candidate => existsSync(candidate))
  if (!executable) throw new Error('DeepSeek Harness is not installed; run `npm ci` from the workspace root')
  return executable
}
