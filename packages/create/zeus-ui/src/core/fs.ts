import fs from 'node:fs/promises'
import path from 'node:path'

export async function ensureDir(file: string): Promise<void> {
  await fs.mkdir(path.dirname(file), {
    recursive: true,
  })
}

export async function fileExists(file: string): Promise<boolean> {
  try {
    await fs.access(file)
    return true
  } catch {
    return false
  }
}

export async function writeFileSafe(
  file: string,
  content: string,
  options: {
    overwrite?: boolean
  } = {},
): Promise<'created' | 'skipped' | 'overwritten'> {
  const exists = await fileExists(file)

  if (exists && !options.overwrite) {
    return 'skipped'
  }

  await ensureDir(file)
  await fs.writeFile(file, content)

  return exists ? 'overwritten' : 'created'
}
