/**
 * i18n catalog gate.
 *
 * Runs in CI and fails the build on the mistakes that are invisible in a demo:
 * a key that exists in one language and not the other, a Chinese message that
 * drops `{count}` so the number disappears, an ICU template that cannot be
 * parsed. Every one of these renders as plausible-looking text, which is why
 * they need a machine check rather than review.
 *
 * Catalogs are discovered by convention: any `locales/en.ts` (or `.mts`, `.js`)
 * next to a sibling `zh-CN` file. That keeps the check applicable to a new
 * application without editing this script.
 *
 * Usage:
 *   node --import tsx scripts/check/check-i18n.ts [--json <file>]
 */
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  checkMessageSyntax,
  messageArgumentNames,
} from '../../packages/core/i18n/src/formatters'
import {
  checkCatalog,
  type CatalogIssue,
  type MessageCatalog,
} from '../../packages/core/i18n/src/message'

const { values } = parseArgs({
  options: {
    json: { type: 'string' },
    filter: { type: 'string' },
  },
})

const root = path.resolve(import.meta.dirname, '../..')

/** Directories that may hold an application's catalogs. */
const SEARCH_ROOTS = ['examples', 'packages']

interface CatalogPair {
  readonly name: string
  readonly directory: string
  readonly enPath: string
  readonly zhPath: string
}

/**
 * Keys whose Chinese text is deliberately identical to English.
 *
 * These are product names and protocol terms: translating "WebC" or "Shadow"
 * would invent a Chinese word for a term the documentation, the code and the
 * browser all call by its English name. Each entry is a claim that the two
 * languages genuinely agree here — not a way to silence a missing translation.
 */
const IDENTICAL_BY_DESIGN: Readonly<Record<string, readonly string[]>> = {
  'examples/playground-editor/src/playground/locales': [
    // Product names.
    'html.title',
    'html.titleNative',
    'html.titleWebc',
    'title.nativeLab',
    'title.webcStudio',
    // Product and technology identifiers shown as labels.
    'product.native',
    'product.webc',
    'example.native',
    'example.webc',
    // DOM and build terms with no accepted Chinese equivalent.
    'inspector.light',
    'inspector.shadow',
    'inspector.manifest',
    'output.pill',
    // Example titles that are code identifiers.
    'example.nativeHello.title',
    'example.nativeShowFor.title',
    'example.nativeRouterQuery.title',
    'example.webcShadow.title',
  ],
}

function findCatalogPairs(): readonly CatalogPair[] {
  const pairs: CatalogPair[] = []
  const extensions = ['.ts', '.mts', '.js', '.mjs']

  function inspect(directory: string): void {
    for (const extension of extensions) {
      const enPath = path.join(directory, `en${extension}`)
      const zhPath = path.join(directory, `zh-CN${extension}`)
      if (!existsSync(enPath) || !existsSync(zhPath)) continue
      pairs.push({
        name: path.relative(root, directory),
        directory,
        enPath,
        zhPath,
      })
      return
    }
  }

  function walk(directory: string, depth: number): void {
    if (depth > 6) return
    let entries: readonly string[]
    try {
      entries = readdirSync(directory)
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git') {
        continue
      }
      const full = path.join(directory, entry)
      if (entry === 'locales') inspect(full)
      walk(full, depth + 1)
    }
  }

  for (const searchRoot of SEARCH_ROOTS) {
    walk(path.join(root, searchRoot), 0)
  }
  return pairs
}

interface CatalogLoad {
  readonly catalog: MessageCatalog
  readonly error?: Error
}

async function loadCatalog(file: string): Promise<CatalogLoad> {
  try {
    const module = (await import(pathToFileURL(file).href)) as {
      default?: unknown
      en?: unknown
      zhCN?: unknown
    }
    const candidate = module.default ?? module.en ?? module.zhCN
    if (!candidate || typeof candidate !== 'object') {
      return {
        catalog: {},
        error: new Error(`${file} does not export a catalog object`),
      }
    }
    return { catalog: candidate as MessageCatalog }
  } catch (cause) {
    return {
      catalog: {},
      error: cause instanceof Error ? cause : new Error(String(cause)),
    }
  }
}

interface Finding {
  readonly catalog: string
  readonly kind: string
  readonly key?: string
  readonly detail: string
}

const findings: Finding[] = []

function report(finding: Finding): void {
  findings.push(finding)
}

async function checkPair(pair: CatalogPair): Promise<void> {
  const [en, zh] = await Promise.all([
    loadCatalog(pair.enPath),
    loadCatalog(pair.zhPath),
  ])

  if (en.error) {
    report({
      catalog: pair.name,
      kind: 'load-error',
      detail: `${path.basename(pair.enPath)}: ${en.error.message}`,
    })
    return
  }
  if (zh.error) {
    report({
      catalog: pair.name,
      kind: 'load-error',
      detail: `${path.basename(pair.zhPath)}: ${zh.error.message}`,
    })
    return
  }

  const reference = en.catalog
  const keys = Object.keys(reference)
  if (keys.length === 0) {
    report({
      catalog: pair.name,
      kind: 'empty-catalog',
      detail: `${path.basename(pair.enPath)} exports no keys`,
    })
    return
  }

  // 1. Key parity, including the same-as-reference heuristic. A copied English
  //    string is usually an untranslated key; the report names it so a human
  //    can confirm rather than the gate guessing.
  const keyIssues: readonly CatalogIssue[] = checkCatalog(
    reference,
    'zh-CN',
    zh.catalog,
    { allowIdenticalKeys: IDENTICAL_BY_DESIGN[pair.name] ?? [] },
  )
  for (const issue of keyIssues) {
    report({
      catalog: pair.name,
      kind: issue.kind,
      key: issue.key,
      detail:
        issue.kind === 'same-as-reference'
          ? 'zh-CN text equals en; translate it or allow it explicitly'
          : `${issue.kind} for "${issue.key}"`,
    })
  }

  // 2. Every message must parse as ICU in both languages.
  for (const [locale, catalog] of [
    ['en', reference],
    ['zh-CN', zh.catalog],
  ] as const) {
    for (const key of keys) {
      const template = catalog[key]
      if (template === undefined) continue
      const error = checkMessageSyntax(locale, template)
      if (error) {
        report({
          catalog: pair.name,
          kind: 'invalid-icu',
          key,
          detail: `${locale}: ${error.message}`,
        })
        continue
      }
      // 3. Placeholder names must match across locales. ICU structures differ
      //    (English plural vs Chinese substitution) but the argument set must
      //    not: dropping `{count}` makes the number vanish from the sentence.
      if (locale === 'zh-CN') {
        const enArguments = new Set(
          messageArgumentNames('en', reference[key] ?? ''),
        )
        const zhArguments = new Set(messageArgumentNames('zh-CN', template))
        for (const argument of enArguments) {
          if (!zhArguments.has(argument)) {
            report({
              catalog: pair.name,
              kind: 'missing-argument',
              key,
              detail: `zh-CN drops {${argument}} that en requires`,
            })
          }
        }
        for (const argument of zhArguments) {
          if (!enArguments.has(argument)) {
            report({
              catalog: pair.name,
              kind: 'extra-argument',
              key,
              detail: `zh-CN uses {${argument}} not present in en`,
            })
          }
        }
      }
    }
  }
}

const pairs = findCatalogPairs().filter(pair =>
  values.filter ? pair.name.includes(values.filter) : true,
)

for (const pair of pairs) {
  await checkPair(pair)
}

const summary = {
  schema: 'zeus.i18n-gate/v1',
  generatedAt: new Date().toISOString(),
  catalogs: pairs.map(pair => pair.name),
  findings,
}

if (values.json) {
  const { writeFileSync } = await import('node:fs')
  writeFileSync(values.json, `${JSON.stringify(summary, null, 2)}\n`)
}

if (pairs.length === 0) {
  // No catalogs yet is not a failure: the gate must be adoptable before the
  // first application migrates. It is reported so a silently-skipped gate is
  // visible in the log.
  console.info('i18n gate: no catalog pairs found (nothing to check)')
  process.exit(0)
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(
      `::error file=${finding.catalog}::${finding.kind}${finding.key ? ` ${finding.key}` : ''} — ${finding.detail}`,
    )
  }
  console.error(
    `i18n gate: ${findings.length} problem(s) across ${pairs.length} catalog(s)`,
  )
  process.exit(1)
}

console.info(
  `i18n gate: ${pairs.length} catalog(s) clean — ${pairs.map(pair => pair.name).join(', ')}`,
)
