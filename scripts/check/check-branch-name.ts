import { execSync } from 'node:child_process'

import pico from 'picocolors'

const branch =
  process.argv[2] ||
  process.env.GITHUB_HEAD_REF ||
  process.env.GITHUB_REF_NAME ||
  getCurrentBranch()

const topic = '[a-z0-9]+(?:-[a-z0-9]+)*'
const version = '\\d+\\.\\d+\\.\\d+(?:-[0-9A-Za-z.-]+)?'
const allowed = [
  /^main$/,
  new RegExp(`^(feat|fix|refactor|chore|docs|test)\\/${topic}-${topic}$`),
  new RegExp(`^release\\/${version}$`),
  new RegExp(`^hotfix\\/${version}-${topic}$`),
]

if (!branch || branch === 'HEAD') {
  console.log(pico.yellow('Skipping branch name check outside a named branch.'))
  process.exit(0)
}

if (allowed.some(pattern => pattern.test(branch))) {
  console.log(pico.green(`Branch name check passed: ${branch}`))
  process.exit(0)
}

console.error(pico.red(`Invalid branch name: ${branch}`))
console.error('')
console.error('Use one of:')
console.error('  main')
console.error('  feat/<scope>-<topic>')
console.error('  fix/<scope>-<topic>')
console.error('  refactor/<scope>-<topic>')
console.error('  chore/<scope>-<topic>')
console.error('  docs/<scope>-<topic>')
console.error('  test/<scope>-<topic>')
console.error('  release/<version>')
console.error('  hotfix/<version>-<topic>')
console.error('')
console.error('Examples:')
console.error('  feat/web-c-lazy-loader')
console.error('  fix/compiler-attrs')
console.error('  chore/canary-downstream-dispatch')
console.error('  release/0.1.0')
console.error('  hotfix/0.1.0-web-c-loader')
process.exit(1)

function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return ''
  }
}
