#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { readJson } from './lib/files.mjs'
import { resolveDshExecutable } from './lib/project.mjs'

const root = resolve(import.meta.dirname, '..')
const executable = resolveDshExecutable(root)
const agent = await readJson(resolve(root, 'config/agent.json'))
const expectedModels = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol']

function section(output, id) {
  const start = output.indexOf(`- id: ${id}\n`)
  if (start < 0) throw new Error(`Resolved config is missing ${id}`)
  const end = output.indexOf('\n- id: ', start + 1)
  return output.slice(start, end < 0 ? output.length : end)
}

for (const [routeName, route] of Object.entries(agent.routes)) {
  const patches = [agent.patch, route.patch].filter(Boolean)
  const args = ['--profile', agent.profile]
  for (const patch of patches) args.push('--patch', resolve(root, patch))
  args.push('--dump-config')
  const result = spawnSync(executable, args, { cwd: root, encoding: 'utf8' })
  if (result.status !== 0) throw new Error(`${routeName} profile failed: ${result.stderr}`)
  const modelSection = section(result.stdout, 'agent-default-model')
  if (!modelSection.includes('provider: openai') || !modelSection.includes(`model: ${route.model}`)) {
    throw new Error(`${routeName} resolved to an unexpected provider/model`)
  }
  const providerSection = section(result.stdout, 'llm-pi-ai')
  if (!providerSection.includes('apiKeyEnv: OPENAI_API_KEY')) throw new Error(`${routeName} lost the OpenAI credential binding`)
  for (const model of expectedModels) if (!providerSection.includes(`id: ${model}`)) throw new Error(`${routeName} lost model ${model}`)
  for (const disabledTool of ['tool-subagent', 'tool-subagent-fork', 'tool-workflow', 'tool-web']) {
    if (!section(result.stdout, disabledTool).includes('disabled: true')) throw new Error(`${routeName} must disable ${disabledTool}`)
  }
}

console.log('DeepSeek Harness resolved all OpenAI-only SDD routes successfully.')
