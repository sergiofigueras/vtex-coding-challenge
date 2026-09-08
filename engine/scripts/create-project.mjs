#!/usr/bin/env node
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PROJECT_ID_PATTERN } from './lib/project.mjs'

function parseArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--id') options.id = argv[++index]
    else if (argument === '--title') options.title = argv[++index]
    else throw new Error(`Unknown argument: ${argument}`)
  }
  if (!PROJECT_ID_PATTERN.test(options.id ?? '')) throw new Error('--id must be a 3-63 character lower-kebab-case ID')
  if (!options.title?.trim() || options.title.trim().length > 120 || /[\r\n]/.test(options.title)) {
    throw new Error('--title must be a non-empty single line of at most 120 characters')
  }
  return { id: options.id, title: options.title.trim() }
}

export async function createProject(workspaceRoot, { id, title }) {
  if (!PROJECT_ID_PATTERN.test(id ?? '')) throw new Error('Invalid project ID')
  if (!title?.trim() || title.trim().length > 120 || /[\r\n]/.test(title)) throw new Error('Project title must be a single line of at most 120 characters')
  const projectsRoot = resolve(workspaceRoot, 'projects')
  const projectRoot = resolve(projectsRoot, id)
  await mkdir(projectsRoot, { recursive: true })
  try {
    await mkdir(projectRoot)
  } catch (error) {
    if (error.code === 'EEXIST') throw new Error(`Project already exists: ${id}`)
    throw error
  }

  const descriptor = {
    schemaVersion: '1.0',
    id,
    name: title.trim(),
    sddManifest: 'docs/sdd/manifest.json',
    traceability: 'docs/sdd/traceability.json',
    sourcesManifest: 'config/sources.json',
    stateDirectory: '.sdd',
  }
  const packageJson = {
    name: `@sdd-project/${id}`,
    version: '0.1.0',
    private: true,
    type: 'module',
    scripts: {
      'sources:ingest': `npm --prefix ../../engine run sources:ingest -- --project ${id}`,
      'sdd:prepare': `npm --prefix ../../engine run sdd:prepare -- --project ${id}`,
      'sdd:run': `npm --prefix ../../engine run sdd:run -- --project ${id}`,
      'sdd:validate': `npm --prefix ../../engine run sdd:validate -- --project ${id}`,
      'cost:record': `npm --prefix ../../engine run cost:record -- --project ${id}`,
      'cost:report': `npm --prefix ../../engine run cost:report -- --project ${id}`,
      check: 'npm run sdd:validate',
    },
  }
  const manifest = { schemaVersion: '1.0', project: id, specifications: [] }
  const traceability = { schemaVersion: '1.0', requirements: [] }
  const sources = { schemaVersion: '1.0', sources: [] }
  const instructions = `# ${title.trim()} agent contract

Read \`project.json\`, \`docs/sdd/manifest.json\`, \`docs/sdd/traceability.json\`, every requested specification and dependency, and the \`sdd-delivery\` skill before editing.

- Implement only explicitly requested ready specifications; dependencies are context-only unless an acceptance criterion requires them.
- Keep requirement authorities explicit and maintain reciprocal traceability.
- Keep runtime state, credentials, private inputs, and generated transcripts under ignored \`.sdd/\` storage.
- Prefer deterministic local inspection and tests. Run narrow tests, then \`npm run check\`.
- Do not commit or push. Report changed files, acceptance evidence, risks, and the active change ID to the outer operator.
`
  const readme = `# ${title.trim()}

This project is driven by the reusable SDD engine in [\`../../engine\`](../../engine).

From the repository root:

\`\`\`bash
npm run project:validate -- --project ${id}
npm run project:prepare -- --project ${id} --change <change-id> --spec <SDD-ID>
\`\`\`

Add product specifications under \`docs/sdd/specs/\`, register them in \`docs/sdd/manifest.json\`, and maintain reciprocal requirement ownership in \`docs/sdd/traceability.json\`.
`

  try {
    await Promise.all([
      mkdir(resolve(projectRoot, 'config'), { recursive: true }),
      mkdir(resolve(projectRoot, 'docs/sdd/specs'), { recursive: true }),
    ])
    const files = [
      ['project.json', descriptor],
      ['package.json', packageJson],
      ['config/sources.json', sources],
      ['docs/sdd/manifest.json', manifest],
      ['docs/sdd/traceability.json', traceability],
    ]
    for (const [path, value] of files) {
      await writeFile(resolve(projectRoot, path), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' })
    }
    await writeFile(resolve(projectRoot, 'AGENTS.md'), instructions, { flag: 'wx' })
    await writeFile(resolve(projectRoot, 'README.md'), readme, { flag: 'wx' })
    return projectRoot
  } catch (error) {
    await rm(projectRoot, { recursive: true, force: true })
    throw error
  }
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  try {
    const engineRoot = resolve(import.meta.dirname, '..')
    const workspaceRoot = resolve(engineRoot, '..')
    const options = parseArgs(process.argv.slice(2))
    const path = await createProject(workspaceRoot, options)
    console.log(`Created ${options.id} at ${path}`)
  } catch (error) {
    console.error(`Project creation failed: ${error.message}`)
    process.exitCode = 1
  }
}
