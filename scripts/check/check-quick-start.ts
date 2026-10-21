import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkCreateZeus } from './check-create-zeus'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const startedAt = performance.now()
const quickStart = readFileSync(
  path.join(root, 'docs/guide/quick-start.md'),
  'utf8',
)
const templateRoot = path.join(
  root,
  'packages/devtools/create-zeus/templates/component-library-ts',
)

assertCodeBlock(
  quickStart,
  'tsx',
  readFileSync(path.join(templateRoot, 'src/components/greeting.tsx'), 'utf8'),
)
assertCodeBlock(
  quickStart,
  'ts',
  readFileSync(path.join(templateRoot, 'src/index.ts'), 'utf8'),
  code => code.includes('ZGreeting'),
)
assertCodeBlock(
  quickStart,
  'css',
  readFileSync(path.join(templateRoot, 'src/styles.css'), 'utf8'),
)
assertCodeBlock(
  quickStart,
  'ts',
  readFileSync(path.join(templateRoot, 'vite.config.ts'), 'utf8'),
  code => code.includes('componentLibrary'),
)
assertCodeBlock(quickStart, 'ts', "import './dist/wc/auto.js'\n", code =>
  code.includes('wc/auto.js'),
)

assertEveryCodeBlockCovered(quickStart, 5)

await checkCreateZeus()

const elapsedMs = Math.round(performance.now() - startedAt)
if (elapsedMs > 15 * 60 * 1000) {
  throw new Error(`The first-use journey exceeded 15 minutes: ${elapsedMs} ms.`)
}
const reportDirectory = path.join(root, 'temp/first-15-minutes')
mkdirSync(reportDirectory, { recursive: true })
writeFileSync(
  path.join(reportDirectory, 'report.json'),
  `${JSON.stringify(
    {
      sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root })
        .toString()
        .trim(),
      measuredAt: new Date().toISOString(),
      elapsedMs,
      budgetMs: 15 * 60 * 1000,
      snippets: [
        {
          language: 'tsx',
          source: 'docs/guide/quick-start.md#create-a-component',
          verification:
            'exact match against component-library/src/components/greeting.tsx and project type-check/build',
        },
        {
          language: 'ts',
          source: 'docs/guide/quick-start.md#configure-vite',
          verification:
            'exact match against component-library/vite.config.ts and production build',
        },
        {
          language: 'ts',
          source: 'docs/guide/quick-start.md#generated-entry',
          verification:
            'exact match against component-library/src/index.ts and generated outputs',
        },
        {
          language: 'css',
          source: 'docs/guide/quick-start.md#template-styles',
          verification:
            'exact match against component-library/src/styles.css and production CSS output',
        },
        {
          language: 'ts',
          source: 'docs/guide/quick-start.md#generated-auto-entry',
          verification:
            'exact match plus component-library dist/wc/auto.js existence and template test',
        },
      ],
      route: [
        'read Quick Start',
        'scaffold Component Library TypeScript template',
        'type-check',
        'production build',
        'run generated template test',
        'verify WC/auto, WC, React, Vue, Manifest and Custom Elements outputs',
      ],
      limitation:
        'Automated journey timing; a human first-time usability session is still recommended.',
    },
    null,
    2,
  )}\n`,
)

console.log(
  `Quick Start snippets match and execute in the component library smoke (${elapsedMs} ms).`,
)

function assertCodeBlock(
  markdown: string,
  language: string,
  expected: string,
  predicate: (code: string) => boolean = () => true,
): void {
  const fence = String.fromCharCode(96).repeat(3)
  const lines = markdown.split(/\r?\n/)
  const blocks: string[] = []

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index] !== fence + language) continue

    const end = lines.indexOf(fence, index + 1)
    if (end < 0) break
    blocks.push(lines.slice(index + 1, end).join('\n') + '\n')
    index = end
  }

  const block = blocks.find(predicate)
  if (block !== expected) {
    throw new Error(
      'Quick Start ' +
        language +
        ' code block does not match the executable template.',
    )
  }
}

function assertEveryCodeBlockCovered(markdown: string, expected: number): void {
  const fence = String.fromCharCode(96).repeat(3)
  let count = 0
  for (const line of markdown.split(/\r?\n/)) {
    if (line.startsWith(fence) && line !== fence) count += 1
  }
  if (count !== expected) {
    throw new Error(
      `Quick Start has ${count} fenced snippets but ${expected} are covered by executable assertions.`,
    )
  }
}
