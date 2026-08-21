import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

describe('commit hook configuration', () => {
  it('passes the git-provided message path to the verifier', () => {
    const packageJson = JSON.parse(
      fs.readFileSync(path.resolve('package.json'), 'utf8'),
    ) as {
      'simple-git-hooks'?: Record<string, string>
    }
    const commitMsg = packageJson['simple-git-hooks']?.['commit-msg']

    expect(commitMsg).toContain('verifyCommit(process.argv[1])')
    expect(commitMsg).toContain('"$1"')
  })
})
