/**
 * Fails when the English and Chinese message tables drift apart, or when a
 * message key used by the playground has no entry. Rendered copy is asserted
 * by the Playwright theme/i18n gate; this guard covers keys a browser run may
 * never reach (error paths, rarely visited panels).
 */
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '../..')
const playground = path.join(root, 'examples/playground-editor/src')

async function main(): Promise<void> {
  const source = await fs.readFile(
    path.join(playground, 'playground/i18n.ts'),
    'utf8',
  )
  const englishKeys = extractKeys(source, 'en')
  const chineseKeys = extractKeys(source, 'zh')
  // English plural forms live in a separate table; they are still keys.
  for (const key of extractPluralKeys(source)) englishKeys.add(key)

  const sources = await collect(path.join(playground, 'playground'))
  sources.push(path.join(playground, 'webc-project.ts'))
  const used = new Set<string>()
  for (const file of sources) {
    if (file.endsWith('i18n.ts')) continue
    const content = await fs.readFile(file, 'utf8')
    for (const match of content.matchAll(/\bt\(\s*'([^']+)'/g))
      used.add(match[1]!)
    for (const match of content.matchAll(/\bmsg\(\s*'([^']+)'/g))
      used.add(match[1]!)
    for (const match of content.matchAll(/titleKey:\s*'([^']+)'/g))
      used.add(match[1]!)
    for (const match of content.matchAll(/descriptionKey:\s*'([^']+)'/g))
      used.add(match[1]!)
    // Template-literal keys, e.g. `hmr.classification.${kind}`.
    for (const match of content.matchAll(/`(hmr\.classification\.)\$\{/g)) {
      for (const kind of [
        'template-structure',
        'script-body',
        'style-only',
        'unknown',
      ]) {
        used.add(`${match[1]}${kind}`)
      }
    }
  }

  const unknown = [...used].filter(key => !englishKeys.has(key))
  assert.deepEqual(
    unknown,
    [],
    `Keys used but not defined: ${unknown.join(', ')}`,
  )

  const untranslated = [...englishKeys].filter(key => !chineseKeys.has(key))
  const extra = [...chineseKeys].filter(key => !englishKeys.has(key))
  assert.deepEqual(
    untranslated,
    [],
    `Missing zh messages: ${untranslated.join(', ')}`,
  )
  assert.deepEqual(
    extra,
    [],
    `zh messages without an en key: ${extra.join(', ')}`,
  )

  console.log(
    `Playground i18n keys: ${englishKeys.size} messages, ${used.size} used, en/zh in sync`,
  )
}

function extractPluralKeys(source: string): Set<string> {
  const start = source.indexOf('const englishPlurals = {')
  if (start === -1) return new Set()
  const end = source.indexOf('\n} as const', start)
  const block = source.slice(start, end)
  return new Set(
    [...block.matchAll(/^  '([^']+)': \{/gm)].map(match => match[1]!),
  )
}

function extractKeys(source: string, locale: 'en' | 'zh'): Set<string> {
  const start = source.indexOf(`  ${locale}: {`)
  if (start === -1) throw new Error(`Missing ${locale} message table.`)
  const end = source.indexOf('\n  },', start)
  const block = source.slice(start, end === -1 ? undefined : end)
  return new Set(
    [...block.matchAll(/^\s{4}'([^']+)':/gm)].map(match => match[1]!),
  )
}

async function collect(directory: string): Promise<string[]> {
  const entries = await fs.readdir(directory, { withFileTypes: true })
  const files: string[] = []
  for (const entry of entries) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) files.push(...(await collect(full)))
    else if (/\.tsx?$/.test(entry.name)) files.push(full)
  }
  return files
}

void main()
