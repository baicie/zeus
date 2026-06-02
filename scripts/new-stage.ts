#!/usr/bin/env tsx

/**
 * 创建新的 stage 目录结构
 *
 * 用法：
 *   pnpm new:stage <number> <task-name>
 *
 * 示例：
 *   pnpm new:stage 6 headless-components
 *
 * 输出：
 *   docs/internal/stage06-headless-components/
 *   ├── design/
 *   ├── review/
 *   └── roadmap.md
 */

import { existsSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = resolve(__filename, '..')
const INTERNAL_ROOT = resolve(__dirname, '../docs/internal')

function usage(code = 0): never {
  console.log(`
Usage: pnpm new:stage <number> <task-name>

Creates a new stage directory under docs/internal/.

Arguments:
  number      Two-digit stage number (e.g. 06)
  task-name   Kebab-case task identifier (e.g. headless-components)

Example:
  pnpm new:stage 6 headless-components
  → docs/internal/stage06-headless-components/
`)
  process.exit(code)
}

async function main() {
  const args = process.argv.slice(2)

  if (args.length < 2) {
    console.error('Error: missing required arguments\n')
    usage(1)
  }

  const [num, ...taskParts] = args
  const taskName = taskParts.join('-')

  if (!/^\d{1,2}$/.test(num)) {
    console.error(`Error: number must be 1-99, got "${num}"\n`)
    usage(1)
  }

  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(taskName)) {
    console.error(
      `Error: task-name must be kebab-case (lowercase letters and hyphens), got "${taskName}"\n`,
    )
    usage(1)
  }

  const padded = num.padStart(2, '0')
  const stageDir = resolve(INTERNAL_ROOT, `stage${padded}-${taskName}`)

  if (existsSync(stageDir)) {
    console.error(`Error: stage already exists at ${stageDir}\n`)
    process.exit(1)
  }

  await mkdir(resolve(stageDir, 'design'), { recursive: true })
  await mkdir(resolve(stageDir, 'review'), { recursive: true })

  await writeFile(
    resolve(stageDir, 'roadmap.md'),
    `# ${stageDir.split(/[/\\]/).pop()}\n\n## 目标\n\n\n## 交付物\n\n\n## 进度\n\n- [ ] \n`,
  )

  console.log(`Created: ${stageDir}`)
  console.log(`  ├── design/`)
  console.log(`  ├── review/`)
  console.log(`  └── roadmap.md`)
}

main()
