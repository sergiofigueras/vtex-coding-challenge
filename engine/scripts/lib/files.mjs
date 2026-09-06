import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'

export async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

export async function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

export async function atomicWrite(path, content) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, content)
  await rename(temporary, path)
}

export async function appendJsonLine(path, value) {
  let existing = ''
  try {
    existing = await readFile(path, 'utf8')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n'
  await atomicWrite(path, `${existing}${separator}${JSON.stringify(value)}\n`)
}

export async function walkFiles(root, predicate = () => true) {
  const { readdir } = await import('node:fs/promises')
  const output = []
  async function visit(directory) {
    let entries
    try {
      entries = await readdir(directory, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    for (const entry of entries) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) await visit(path)
      else if (entry.isFile() && predicate(path)) output.push(path)
    }
  }
  await visit(root)
  return output.sort()
}

export async function existingFileMetadata(paths) {
  const result = new Map()
  for (const path of paths) {
    try {
      const metadata = await stat(path)
      result.set(resolve(path), { mtimeMs: metadata.mtimeMs, size: metadata.size })
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
    }
  }
  return result
}
