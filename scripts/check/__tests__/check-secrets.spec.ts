import { describe, expect, it } from 'vitest'

import { scanSecrets } from '../check-secrets'

describe('secret scan', () => {
  it('reports high-confidence tokens without echoing the value', () => {
    const awsAccessKey = ['AKIA', 'ABCDEFGHIJKLMNOP'].join('')
    const findings = scanSecrets(['src/config.ts'], () => {
      return `const key = "${awsAccessKey}"\n`
    })

    expect(findings).toEqual([
      { path: 'src/config.ts', line: 1, rule: 'aws-access-key' },
    ])
    expect(JSON.stringify(findings)).not.toContain(awsAccessKey)
  })

  it('detects private key blocks and ignores explicit placeholders', () => {
    const privateKeyHeader = ['-----BEGIN', ' OPENSSH PRIVATE KEY-----'].join(
      '',
    )
    const findings = scanSecrets(['a.pem', 'b.ts'], path =>
      path.endsWith('.pem')
        ? `${privateKeyHeader}\n`
        : 'const token = "ghp_exampleexampleexampleexampleexample"\n',
    )

    expect(findings).toEqual([{ path: 'a.pem', line: 1, rule: 'private-key' }])
  })

  it('skips non-text and unreadable files', () => {
    expect(
      scanSecrets(['image.png', 'missing.ts'], () => {
        throw new Error('missing')
      }),
    ).toEqual([])
  })
})
