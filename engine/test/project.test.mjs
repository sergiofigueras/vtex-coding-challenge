import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { createProject } from '../scripts/create-project.mjs'
import { discoverProjects, loadProject, parseProjectArgs, resolveContainedPath } from '../scripts/lib/project.mjs'

test('extracts a project selector without consuming command arguments', () => {
  assert.deepEqual(
    parseProjectArgs(['prepare', '--project', 'catalog-consolidation', '--spec', 'SDD-001']),
    { projectId: 'catalog-consolidation', remaining: ['prepare', '--spec', 'SDD-001'] },
  )
})

test('creates and loads a valid project without copying engine internals', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'sdd-workspace-'))
  const engineRoot = resolve(workspaceRoot, 'engine')
  await mkdir(engineRoot)
  const projectRoot = await createProject(workspaceRoot, { id: 'example-service', title: 'Example Service' })
  const project = await loadProject(engineRoot, 'example-service')
  assert.equal(project.root, await realpath(projectRoot))
  assert.equal(project.name, 'Example Service')
  assert.deepEqual(JSON.parse(await readFile(project.manifestPath, 'utf8')).specifications, [])
  const packageJson = JSON.parse(await readFile(resolve(projectRoot, 'package.json'), 'utf8'))
  assert.match(packageJson.scripts['sdd:prepare'], /--project example-service$/)
  await assert.rejects(readFile(resolve(projectRoot, 'scripts/sdd-agent.mjs')), /ENOENT/)
  await assert.rejects(createProject(workspaceRoot, { id: 'example-service', title: 'Duplicate' }), /already exists/)
})

test('rejects a project directory that escapes projects through a symlink', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'sdd-workspace-'))
  const engineRoot = resolve(workspaceRoot, 'engine')
  const outsideRoot = resolve(workspaceRoot, 'outside')
  await mkdir(engineRoot)
  await mkdir(resolve(workspaceRoot, 'projects'))
  await createProject(workspaceRoot, { id: 'valid-project', title: 'Valid Project' })
  await mkdir(outsideRoot)
  await writeFile(resolve(outsideRoot, 'project.json'), `${JSON.stringify({
    schemaVersion: '1.0',
    id: 'escaped-project',
    name: 'Escaped Project',
    sddManifest: 'docs/sdd/manifest.json',
    traceability: 'docs/sdd/traceability.json',
    sourcesManifest: 'config/sources.json',
    stateDirectory: '.sdd',
  })}\n`)
  await symlink(outsideRoot, resolve(workspaceRoot, 'projects/escaped-project'))
  await assert.rejects(loadProject(engineRoot, 'escaped-project'), /resolves outside/)
  await assert.rejects(discoverProjects(engineRoot), /may not be symlinks/)
})

test('rejects a project file that resolves outside its project', async () => {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'sdd-workspace-'))
  const projectRoot = await createProject(workspaceRoot, { id: 'bounded-project', title: 'Bounded Project' })
  const outsideFile = resolve(workspaceRoot, 'outside.md')
  await writeFile(outsideFile, 'outside')
  const link = resolve(projectRoot, 'docs/sdd/specs/escaped.md')
  await symlink(outsideFile, link)
  await assert.rejects(resolveContainedPath(await realpath(projectRoot), 'docs/sdd/specs/escaped.md', 'spec path'), /resolves outside/)
})
