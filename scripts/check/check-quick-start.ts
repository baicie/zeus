import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { checkCreateZeus } from './check-create-zeus'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
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

await checkCreateZeus()

console.log(
  'Quick Start snippets match and execute in the component library smoke.',
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
