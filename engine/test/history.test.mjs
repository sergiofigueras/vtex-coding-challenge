import assert from 'node:assert/strict'
import { link, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { zstdCompressSync } from 'node:zlib'
import test from 'node:test'
import { createHistory, validateHistory } from '../scripts/lib/history.mjs'

async function fixture() {
  const workspace = await mkdtemp(join(tmpdir(), 'sdd-history-')); const engine = resolve(workspace, 'engine'); const root = resolve(workspace, 'projects/example-service'); const state = resolve(root, '.sdd')
  await mkdir(resolve(state, 'runs/run-one'), { recursive: true }); await mkdir(resolve(state, 'dsh-home/sessions/session-one'), { recursive: true }); await mkdir(resolve(root, 'config'), { recursive: true }); await mkdir(engine, { recursive: true }); await mkdir(resolve(engine, 'cost'), { recursive: true })
  const sources = { schemaVersion: '1.0', sources: [{ id: 'SRC-1', fileName: 'fixture.json', bytes: 4, sha256: '8b3369944dd2a3fab39e32d1aeb1f763946a458ae3e6368a46432adc8f3a0860', url: 'https://example.test/fixture.json' }] }
  await writeFile(resolve(root, 'config/sources.json'), JSON.stringify(sources)); await mkdir(resolve(state, 'inputs'), { recursive: true }); await writeFile(resolve(state, 'inputs/fixture.json'), 'safe'); await writeFile(resolve(state, 'inputs/inventory.json'), JSON.stringify({ schemaVersion: '1.0', sources: [{ id: 'SRC-1', sourceUrl: sources.sources[0].url, localFile: 'fixture.json', bytes: 4, sha256: '8b3369944dd2a3fab39e32d1aeb1f763946a458ae3e6368a46432adc8f3a0860' }] })); await writeFile(resolve(engine, 'cost/ledger.jsonl'), `${JSON.stringify({ projectId: 'example-service', runId: 'run-one', changeId: 'example-change', measurement: 'unreconciled', actualUsd: null, estimatedUsd: 1, sourceSessionFiles: ['.sdd/dsh-home/sessions/session-one/session.jsonl.zstd'] })}\n`)
  const run = { schemaVersion: '1.0', runId: 'run-one', projectId: 'example-service', preparedAt: '2026-01-01T00:00:00Z', provider: 'openai', model: 'gpt-5.6-terra', path: `${root}/src/a.mjs` }
  await writeFile(resolve(state, 'runs/run-one/manifest.json'), JSON.stringify(run)); await writeFile(resolve(state, 'runs/run-one/result.json'), JSON.stringify({ outcome: 'failed', attempts: [1, 2] })); await writeFile(resolve(state, 'runs/run-one/prompt.md'), 'User asks from ' + root); await writeFile(resolve(state, 'runs/run-one/stdout.txt'), 'ok'); await writeFile(resolve(state, 'runs/run-one/stderr.txt'), 'retry 2')
  const rows = [
    { type: 'session', id: 'session-one', sessionId: 'session-one', seq: 1, data: {} },
    { type: 'user/message', sessionId: 'session-one', seq: 2, data: { text: `hello ${workspace}` } },
    { type: 'assistant/message', sessionId: 'session-one', seq: 3, data: { message: { content: [{ type: 'text', text: 'answer' }, { type: 'reasoning', text: 'private thought', encryptedSignature: 'never-publish' }], toolCalls: [{ name: 'read', arguments: { path: 'public' } }] }, model: 'gpt-5.6-terra', reasoningEffort: 'medium', usage: { inputTokens: 4, outputTokens: 2, reasoningTokens: 7 }, reasoning: 'private thought', replayState: { encryptedPayload: 'secret-replay' }, stream: [{ bytes: 'redundant' }] } },
    { type: 'tool/call', sessionId: 'session-one', seq: 4, data: { name: 'read', arguments: { path: `${root}/x` } } },
    { type: 'tool/result', sessionId: 'session-one', seq: 5, data: { stdout: 'shown', stderr: '' } },
    { type: 'turn/end', sessionId: 'session-one', seq: 6, data: { outcome: 'failed' } },
  ]
  await writeFile(resolve(state, 'dsh-home/sessions/session-one/session.jsonl.zstd'), Buffer.concat(rows.map(row => zstdCompressSync(Buffer.from(`${JSON.stringify(row)}\n`)))))
  await mkdir(resolve(state, 'cache'), { recursive: true }); await writeFile(resolve(state, 'cache/private-cache.json'), 'not exported')
  await mkdir(resolve(state, 'generated-profile'), { recursive: true }); await writeFile(resolve(state, 'generated-profile/profile.json'), 'not exported')
  await writeFile(resolve(state, 'replay.bin'), 'not exported')
  return { workspace, engine, project: { id: 'example-service', workspaceRoot: workspace, root, stateRoot: state, sourcesPath: resolve(root, 'config/sources.json') } }
}

test('accepts producer-shaped run IDs through the exact generated maximum', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  const observed = '2026-09-06t16-22-06-302z-catalog-delivery-fix-runtime-and-replay-docs'
  const maximum = `2026-09-06t16-22-06-302z-${'a'.repeat(60)}`
  for (const runId of [observed, maximum]) {
    const dir = resolve(f.project.stateRoot, 'runs', runId); await mkdir(dir, { recursive: true })
    await writeFile(resolve(dir, 'manifest.json'), JSON.stringify({ schemaVersion: '1.0', runId, projectId: 'example-service', preparedAt: '2026-01-02T00:00:00Z' }))
    await writeFile(resolve(dir, 'prompt.md'), 'prepared')
  }
  await createHistory(f.engine, f.project, { snapshot: 'generated-run-ids', cutoff: '2026-02-01T00:00:00Z' })
  await validateHistory(f.engine, f.project, { snapshot: 'generated-run-ids' })
  assert.equal(observed.length, 69); assert.equal(maximum.length, 85)
  const overLimit = `${maximum}a`; const dir = resolve(f.project.stateRoot, 'runs', overLimit); await mkdir(dir, { recursive: true })
  await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'over-limit-run-id', cutoff: '2026-02-01T00:00:00Z' }), /Unsafe run entry/)
})

test('normalizes a real-shaped legacy manifest only within the selected project', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  const dir = resolve(f.project.stateRoot, 'runs/legacy-run'); await mkdir(dir, { recursive: true })
  const legacy = { schemaVersion: '1.0', runId: 'legacy-run', changeId: 'legacy-change', specIds: ['SDD-094'], provider: 'openai', model: 'gpt-5.6-terra', route: 'default', preparedAt: '2026-01-03T00:00:00Z' }
  await writeFile(resolve(dir, 'manifest.json'), JSON.stringify(legacy)); await writeFile(resolve(dir, 'result.json'), JSON.stringify({ outcome: 'failed' })); await writeFile(resolve(dir, 'prompt.md'), 'legacy'); await writeFile(resolve(dir, 'stdout.txt'), 'ok'); await writeFile(resolve(dir, 'stderr.txt'), '')
  const root = await createHistory(f.engine, f.project, { snapshot: 'legacy-compatible', cutoff: '2026-02-01T00:00:00Z' }); await validateHistory(f.engine, f.project, { snapshot: 'legacy-compatible' })
  const record = JSON.parse(await readFile(resolve(root, 'runs/legacy-run.json'), 'utf8'))
  assert.equal(record.manifest.projectId, 'example-service'); assert.equal(record.manifest.provenance.attribution, 'selected-project-legacy'); assert.match(record.manifest.provenance.originalManifestSha256, /^[a-f0-9]{64}$/)
  const mismatch = resolve(f.project.stateRoot, 'runs/mismatch-run'); await mkdir(mismatch, { recursive: true }); await writeFile(resolve(mismatch, 'manifest.json'), JSON.stringify({ ...legacy, runId: 'mismatch-run', projectId: 'other-project' }))
  await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'mismatch', cutoff: '2026-02-01T00:00:00Z' }), /Invalid required run record/)
  const malformed = resolve(f.project.stateRoot, 'runs/malformed-run'); await mkdir(malformed, { recursive: true }); await writeFile(resolve(malformed, 'manifest.json'), JSON.stringify({ ...legacy, runId: 'malformed-run', projectId: null }))
  await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'malformed', cutoff: '2026-02-01T00:00:00Z' }), /Invalid required run record/)
})

test('exports prepared-only runs with explicit null execution fields beside completed runs', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  const dir = resolve(f.project.stateRoot, 'runs/run-prepared'); await mkdir(dir, { recursive: true })
  await writeFile(resolve(dir, 'manifest.json'), JSON.stringify({ schemaVersion: '1.0', runId: 'run-prepared', projectId: 'example-service', preparedAt: '2026-01-02T00:00:00Z', provider: 'openai', model: 'gpt-5.6-terra' }))
  await writeFile(resolve(dir, 'prompt.md'), 'prepared prompt')
  const root = await createHistory(f.engine, f.project, { snapshot: 'prepared-and-complete', cutoff: '2026-02-01T00:00:00Z' }); await validateHistory(f.engine, f.project, { snapshot: 'prepared-and-complete' })
  const prepared = JSON.parse(await readFile(resolve(root, 'runs/run-prepared.json'), 'utf8'))
  assert.equal(prepared.state, 'prepared-only'); assert.equal(prepared.result, null)
  assert.deepEqual(prepared.artifacts.filter(item => item.name !== 'prompt.md').map(item => item.path), [null, null, null])
  assert.equal(JSON.parse(await readFile(resolve(root, 'runs/run-one.json'), 'utf8')).state, 'executed')
})

test('exports a deterministic semantic history from concatenated Zstandard frames', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  const first = await createHistory(f.engine, f.project, { snapshot: 'snapshot-one', cutoff: '2026-02-01T00:00:00Z' }); await validateHistory(f.engine, f.project, { snapshot: 'snapshot-one' })
  const session = await readFile(resolve(first, 'sessions/session-one.json'), 'utf8'); assert.match(session, /<WORKSPACE>|<PROJECT>/); assert.doesNotMatch(session, /private thought|redundant|never-publish|secret-replay/); assert.match(session, /tool\/call/); assert.match(session, /reasoningEffort/); assert.match(session, /reasoningTokens/); assert.match(session, /gpt-5\.6-terra/)
  const manifest = JSON.parse(await readFile(resolve(first, 'manifest.json'), 'utf8')); assert.equal(manifest.coverage.runIds[0], 'run-one'); assert.equal(manifest.coverage.sessionIds[0], 'session-one'); assert.ok(manifest.files.some(file => file.path.startsWith('artifacts/')))
  await createHistory(f.engine, f.project, { snapshot: 'snapshot-two', cutoff: '2026-02-01T00:00:00Z' }); const second = resolve(f.project.stateRoot, 'history/snapshot-two'); assert.deepEqual(JSON.parse(await readFile(resolve(first, 'manifest.json'))).files, JSON.parse(await readFile(resolve(second, 'manifest.json'))).files)
  await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'snapshot-one', cutoff: '2026-02-01T00:00:00Z' }), /already exists/)
})

test('accepts every known semantic event, excludes internal projections, and rejects unknown types', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  const types = ['session', 'permission/preset', 'sandbox/mode', 'approval/policy', 'agent/inbox/spliced', 'turn/start', 'turn/end', 'step/start', 'step/end', 'user/message', 'assistant/message', 'tool/call', 'tool/result', 'todo/write', 'goal/change', 'llm/retry', 'llm/retry-started', 'session/title', 'session/title-llm-request', 'request/header', 'request/context']
  const rows = types.map((type, index) => ({ type, sessionId: 'session-one', seq: index + 1, data: {} }))
  await writeFile(resolve(f.project.stateRoot, 'dsh-home/sessions/session-one/session.jsonl.zstd'), Buffer.concat(rows.map(row => zstdCompressSync(Buffer.from(`${JSON.stringify(row)}\n`)))))
  const root = await createHistory(f.engine, f.project, { snapshot: 'known-events', cutoff: '2026-02-01T00:00:00Z' }); await validateHistory(f.engine, f.project, { snapshot: 'known-events' })
  const session = JSON.parse(await readFile(resolve(root, 'sessions/session-one.json'))); assert.equal(session.events.length, types.length - 2); assert.ok(session.events.some(event => event.type === 'goal/change'))
})

test('rejects unsafe identifiers, private artifacts, credentials, and malformed records without publication', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  await assert.rejects(createHistory(f.engine, f.project, { snapshot: '../escape', cutoff: '2026-02-01T00:00:00Z' }), /safe/)
  await writeFile(resolve(f.project.stateRoot, 'runs/run-one/prompt.md'), ['OPENAI', 'API_KEY=abcdef0123456789abcdef'].join('_')); await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'credential', cutoff: '2026-02-01T00:00:00Z' }), /Credential/)
  await writeFile(resolve(f.project.stateRoot, 'runs/run-one/prompt.md'), 'safe'); await writeFile(resolve(f.project.stateRoot, 'raw.db'), 'not exportable'); await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'private-db', cutoff: '2026-02-01T00:00:00Z' }), /Private artifact/)
})

test('validator rejects tampering, extra output, missing output, and unsafe links', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true })); const root = await createHistory(f.engine, f.project, { snapshot: 'validate-me', cutoff: '2026-02-01T00:00:00Z' })
  await writeFile(resolve(root, 'extra.txt'), 'extra'); await assert.rejects(validateHistory(f.engine, f.project, { snapshot: 'validate-me' }), /Unexpected/); await rm(resolve(root, 'extra.txt'))
  const runPath = resolve(root, 'runs/run-one.json'); await writeFile(runPath, 'tampered'); await assert.rejects(validateHistory(f.engine, f.project, { snapshot: 'validate-me' }), /modified/); await rm(runPath); await assert.rejects(validateHistory(f.engine, f.project, { snapshot: 'validate-me' }), /missing/)
})

test('validator rejects a self-consistent manifest that omits required outputs', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true })); const root = await createHistory(f.engine, f.project, { snapshot: 'required-layout', cutoff: '2026-02-01T00:00:00Z' })
  const manifestPath = resolve(root, 'manifest.json'); const manifest = JSON.parse(await readFile(manifestPath, 'utf8')); manifest.files = manifest.files.filter(entry => entry.path !== 'inventory.json'); manifest.manifestSha256 = null; manifest.manifestSha256 = (await import('node:crypto')).createHash('sha256').update(`${JSON.stringify(manifest, null, 2)}\n`).digest('hex'); await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  await assert.rejects(validateHistory(f.engine, f.project, { snapshot: 'required-layout' }), /Missing required published artifact/)
})

test('clean-clone validation needs no private runtime state or provider access', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true })); await createHistory(f.engine, f.project, { snapshot: 'clean-copy', cutoff: '2026-02-01T00:00:00Z' })
  await rm(resolve(f.project.stateRoot, 'runs'), { recursive: true }); await rm(resolve(f.project.stateRoot, 'dsh-home'), { recursive: true }); await rm(resolve(f.project.stateRoot, 'cache'), { recursive: true }); await rm(resolve(f.project.stateRoot, 'generated-profile'), { recursive: true }); await rm(resolve(f.project.stateRoot, 'replay.bin'))
  await validateHistory(f.engine, f.project, { snapshot: 'clean-copy' })
})

test('strips complete private blocks, preserves diagnostics, and counts every block', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  const payload = 'policy text mentions dsh: reasoning: mid-line and stays\r\ndsh: reasoning:\r\n**SECRET TITLE**\r\n\r\nSECRET BODY\r\ndsh: RATE_LIMIT: retry later\r\nvisible diagnostic body\r\ndsh: thinking:\r\nEOF SECRET'
  await writeFile(resolve(f.project.stateRoot, 'runs/run-one/stderr.txt'), payload)
  const root = await createHistory(f.engine, f.project, { snapshot: 'full-private-blocks', cutoff: '2026-02-01T00:00:00Z' })
  const record = JSON.parse(await readFile(resolve(root, 'runs/run-one.json')))
  const artifact = record.artifacts.find(item => item.name === 'stderr.txt')
  const text = await readFile(resolve(root, artifact.path), 'utf8')
  assert.doesNotMatch(text, /SECRET TITLE|SECRET BODY|EOF SECRET/)
  assert.match(text, /policy text mentions dsh: reasoning: mid-line and stays/)
  assert.match(text, /dsh: RATE_LIMIT: retry later/)
  assert.match(text, /visible diagnostic body/)
  const exclusions = JSON.parse(await readFile(resolve(root, 'reports/exclusions.json'))).exclusions
  const privateEntry = exclusions.find(item => item.locator === 'runs/run-one/stderr.txt' && item.reason === 'private-reasoning')
  assert.equal(privateEntry.count, 2)
})

test('validator rejects a symlinked published artifact', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true })); const root = await createHistory(f.engine, f.project, { snapshot: 'links-test', cutoff: '2026-02-01T00:00:00Z' }); await symlink(resolve(root, 'manifest.json'), resolve(root, 'runs/link.json')); await assert.rejects(validateHistory(f.engine, f.project, { snapshot: 'links-test' }), /Symlink/)
})

test('links only ledger-associated sessions and accounts for every semantic exclusion', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  await mkdir(resolve(f.project.stateRoot, 'dsh-home/sessions/b'), { recursive: true })
  await writeFile(resolve(f.project.stateRoot, 'dsh-home/sessions/b/other.jsonl'), JSON.stringify({ type: 'session', sessionId: 'other-session', data: {} }) + '\n')
  await symlink(resolve(f.project.stateRoot, 'replay.bin'), resolve(f.project.stateRoot, 'generated-profile/dependency-link'))
  const root = await createHistory(f.engine, f.project, { snapshot: 'coverage-test', cutoff: '2026-02-01T00:00:00Z' })
  const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8')); assert.deepEqual(manifest.coverage.sessionIds, ['session-one'])
  const exclusions = JSON.parse(await readFile(resolve(root, 'reports/exclusions.json'), 'utf8')).exclusions.map(item => item.reason)
  for (const reason of ['cache', 'generated-profile', 'encrypted-replay', 'private-reasoning', 'redundant-stream-chunk', 'symlink']) assert.ok(exclusions.includes(reason), reason)
})

test('derives stable identity from session header and parent directories, failing closed on conflicts', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  const second = resolve(f.project.stateRoot, 'dsh-home/sessions/session-two'); await mkdir(second, { recursive: true })
  await writeFile(resolve(second, 'session.jsonl.zstd'), zstdCompressSync(Buffer.from(JSON.stringify({ type: 'session', id: 'session-two', data: {} }) + '\n')))
  await writeFile(resolve(f.engine, 'cost/ledger.jsonl'), [
    { projectId: 'example-service', runId: 'run-one', sourceSessionFiles: ['.sdd/dsh-home/sessions/session-one/session.jsonl.zstd', '.sdd/dsh-home/sessions/session-two/session.jsonl.zstd'] }
  ].map(row => JSON.stringify(row)).join('\\n') + '\n')
  const root = await createHistory(f.engine, f.project, { snapshot: 'two-session-files', cutoff: '2026-02-01T00:00:00Z' }); await validateHistory(f.engine, f.project, { snapshot: 'two-session-files' })
  assert.deepEqual(JSON.parse(await readFile(resolve(root, 'manifest.json'))).coverage.sessionIds, ['session-one', 'session-two'])
  await rm(root, { recursive: true, force: true })
  await writeFile(resolve(second, 'session.jsonl.zstd'), zstdCompressSync(Buffer.from(JSON.stringify({ type: 'session', id: 'session-one', data: {} }) + '\n')))
  await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'mismatched-identity', cutoff: '2026-02-01T00:00:00Z' }), /Unreadable linked session/)
  await rm(second, { recursive: true, force: true }); const missing = resolve(f.project.stateRoot, 'dsh-home/sessions/session.jsonl.zstd'); await writeFile(missing, zstdCompressSync(Buffer.from(JSON.stringify({ type: 'user/message', data: {} }) + '\n')))
  await writeFile(resolve(f.engine, 'cost/ledger.jsonl'), JSON.stringify({ projectId: 'example-service', runId: 'run-one', sourceSessionFiles: ['.sdd/dsh-home/sessions/session.jsonl.zstd'] }) + '\n')
  await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'missing-identity', cutoff: '2026-02-01T00:00:00Z' }), /Unreadable linked session/)
  await rm(second, { recursive: true, force: true }); await mkdir(resolve(f.project.stateRoot, 'dsh-home/sessions/other'), { recursive: true }); await writeFile(resolve(f.project.stateRoot, 'dsh-home/sessions/other/session.jsonl.zstd'), zstdCompressSync(Buffer.from(JSON.stringify({ type: 'session', id: 'session-one', data: {} }) + '\n')))
  await writeFile(resolve(f.engine, 'cost/ledger.jsonl'), JSON.stringify({ projectId: 'example-service', runId: 'run-one', sourceSessionFiles: ['.sdd/dsh-home/sessions/session-one/session.jsonl.zstd', '.sdd/dsh-home/sessions/other/session.jsonl.zstd'] }) + '\n')
  await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'duplicate-identity', cutoff: '2026-02-01T00:00:00Z' }), /Unreadable linked session/)
})

test('fails closed for ambiguous linkage and validator rejects hard links and extra directories', async t => {
  const f = await fixture(); t.after(() => rm(f.workspace, { recursive: true, force: true }))
  await writeFile(resolve(f.engine, 'cost/ledger.jsonl'), JSON.stringify({ projectId: 'example-service', runId: 'run-one', sourceSessionFiles: ['.sdd/../escape.jsonl'] }) + '\n')
  await assert.rejects(createHistory(f.engine, f.project, { snapshot: 'bad-linkage', cutoff: '2026-02-01T00:00:00Z' }), /Unsafe linked/)
  await writeFile(resolve(f.engine, 'cost/ledger.jsonl'), JSON.stringify({ projectId: 'example-service', runId: 'run-one', sourceSessionFiles: ['.sdd/dsh-home/sessions/session-one/session.jsonl.zstd'] }) + '\n')
  const root = await createHistory(f.engine, f.project, { snapshot: 'strict-layout', cutoff: '2026-02-01T00:00:00Z' })
  await mkdir(resolve(root, 'unexpected')); await assert.rejects(validateHistory(f.engine, f.project, { snapshot: 'strict-layout' }), /Unexpected snapshot directory/); await rm(resolve(root, 'unexpected'), { recursive: true })
  await link(resolve(root, 'inventory.json'), resolve(root, 'reports/hard-link.json')); await assert.rejects(validateHistory(f.engine, f.project, { snapshot: 'strict-layout' }), /Hard link/)
})
