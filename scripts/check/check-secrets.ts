import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

import pico from 'picocolors'

interface SecretRule {
  readonly name: string
  readonly pattern: RegExp
}

const RULES: readonly SecretRule[] = [
  { name: 'aws-access-key', pattern: /AKIA[0-9A-Z]{16}/ },
  { name: 'github-token', pattern: /gh[pousr]_[A-Za-z0-9]{36,}/ },
  { name: 'npm-token', pattern: /npm_[A-Za-z0-9]{36,}/ },
  { name: 'slack-token', pattern: /xox[baprs]-[A-Za-z0-9-]{10,}/ },
  {
    name: 'private-key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
]

const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.cts',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.mts',
  '.pem',
  '.key',
  '.rs',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.vue',
  '.yaml',
  '.yml',
])

const PLACEHOLDER = /(?:example|dummy|placeholder|fake|sample|test|redacted)/i

export interface SecretFinding {
  readonly path: string
  readonly line: number
  readonly rule: string
}

/** Scans tracked text files. Findings never include the matched value. */
export function scanSecrets(
  files: readonly string[],
  read: (path: string) => string = path => readFileSync(path, 'utf8'),
): SecretFinding[] {
  const findings: SecretFinding[] = []
  for (const file of files) {
    const extension = file.slice(file.lastIndexOf('.'))
    if (!TEXT_EXTENSIONS.has(extension)) continue
    let content: string
    try {
      content = read(file)
    } catch {
      continue
    }
    const lines = content.split(/\r?\n/)
    for (const [index, line] of lines.entries()) {
      if (PLACEHOLDER.test(line)) continue
      for (const rule of RULES) {
        if (rule.pattern.test(line)) {
          findings.push({ path: file, line: index + 1, rule: rule.name })
        }
      }
    }
  }
  return findings
}

function main(): void {
  const files = execFileSync('git', ['ls-files'], {
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
  const findings = scanSecrets(files)
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(
        pico.red(`${finding.path}:${finding.line}: ${finding.rule}`),
      )
    }
    process.exitCode = 1
    return
  }
  console.log(pico.green(`Secret scan passed (${files.length} tracked files).`))
}

if (import.meta.url === `file://${process.argv[1]}`) main()
