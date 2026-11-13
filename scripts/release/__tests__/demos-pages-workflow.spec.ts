import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * The Demos Pages workflow's pairing contract, asserted against the file.
 *
 * The scripts can be correct while the workflow still passes the wrong SHA —
 * that is exactly how R6-A shipped: the job handed the UI recorder
 * `GITHUB_SHA`, so the published `ai-demo-recording.json.uiCommit` named the
 * *Core* commit. These assertions pin the wiring, so a future edit that
 * reintroduces a moving ref or a borrowed SHA fails here rather than on a
 * published demo.
 *
 * The workflow is read as text rather than parsed: Core does not depend on a
 * YAML parser, and every assertion below is about a command or a key that must
 * appear verbatim. `stepOrder` keeps the ordering checks honest by slicing the
 * file at the step names instead of matching line numbers.
 */
const root = resolve(import.meta.dirname, '../../..')
const source = readFileSync(
  resolve(root, '.github/workflows/demos-pages.yml'),
  'utf8',
)

/** The file offset of each `- name:` marker, in the order requested. */
function stepOrder(names: readonly string[]): number[] {
  return names.map(name => source.indexOf(`- name: ${name}`))
}

function section(name: string): string {
  const start = source.indexOf(`- name: ${name}`)
  if (start < 0) throw new Error(`missing step: ${name}`)
  const next = source.indexOf('\n      - ', start + 1)
  return source.slice(start, next < 0 ? undefined : next)
}

/** The job block for `build`, up to the next top-level job. */
function buildJob(): string {
  const start = source.indexOf('\n  build:\n')
  if (start < 0) throw new Error('missing build job')
  const next = source.indexOf('\n  publish:\n')
  return source.slice(start, next < 0 ? undefined : next)
}

describe('demos pages workflow', () => {
  it('checks the UI out at a resolved SHA, not a moving branch', () => {
    const checkout = section('Checkout UI')

    expect(checkout).toContain('git fetch')
    expect(checkout).toContain('git checkout -q --detach FETCH_HEAD')
    // The defect was `git clone --depth 1 <branch>`: the branch could move
    // between resolution and build, and nothing recorded which commit ran.
    expect(checkout).not.toContain('git clone')
  })

  it('records the real pair instead of reusing GITHUB_SHA for both sides', () => {
    const build = buildJob()

    expect(build).toContain('--core-commit "${{ steps.pair.outputs.core }}"')
    expect(build).toContain('--ui-commit "${{ steps.pair.outputs.ui }}"')
    // `GITHUB_SHA` identifies the Core commit. Handing it to the UI recorder is
    // the R6-A defect and must not come back in any spelling. The only allowed
    // use is the Core-checkout equality check.
    const uiLines = build
      .split('\n')
      .filter(line => line.includes('--ui-commit'))
    expect(uiLines.length).toBeGreaterThan(0)
    for (const line of uiLines) {
      expect(line).not.toContain('GITHUB_SHA')
      expect(line).not.toContain('github.sha')
    }
  })

  it('resolves both commits to full SHAs and records them', () => {
    const pair = section('Resolve and record the pair')

    expect(pair).toContain('git -C zeus rev-parse HEAD')
    expect(pair).toContain('git -C zeus-ui rev-parse HEAD')
    expect(pair).toContain('^[0-9a-f]{40}$')
    expect(pair).toContain('GITHUB_STEP_SUMMARY')
    // The outputs are what every later step consumes.
    expect(buildJob()).toContain('core-commit: ${{ steps.pair.outputs.core }}')
    expect(buildJob()).toContain('ui-commit: ${{ steps.pair.outputs.ui }}')
  })

  it('verifies the pairing before the site can be published', () => {
    const [assemble, write, verify, upload] = stepOrder([
      'Assemble the site',
      'Write the demo pairing manifest',
      'Verify the demo pairing',
      'Upload the site',
    ])

    expect(assemble).toBeGreaterThanOrEqual(0)
    expect(write).toBeGreaterThan(assemble)
    expect(verify).toBeGreaterThan(write)
    expect(upload).toBeGreaterThan(verify)

    const run = section('Verify the demo pairing')
    expect(run).toContain('--verify --reproducible')
    expect(run).toContain('--core-commit "${{ steps.pair.outputs.core }}"')
    expect(run).toContain('--ui-commit "${{ steps.pair.outputs.ui }}"')
  })

  it('publishes only on a main push or an explicit publish dispatch', () => {
    const publishStart = source.indexOf('\n  publish:\n')
    const publish = source.slice(publishStart)

    expect(publish).toContain("github.event_name == 'push'")
    expect(publish).toContain('inputs.publish == true')
    // A dispatch defaults to a build-only run and to the branch tip, which is
    // then resolved to the SHA recorded in the manifest.
    const inputs = source.slice(
      source.indexOf('  workflow_dispatch:'),
      source.indexOf('\npermissions:'),
    )
    expect(inputs).toContain('default: false')
    expect(inputs).toContain('default: main')
  })

  it('re-verifies the artifact across the job boundary before pushing', () => {
    const publish = source.slice(source.indexOf('\n  publish:\n'))
    const verify = publish.indexOf(
      '- name: Re-verify the pair before publishing',
    )
    const push = publish.indexOf('- name: Push to the Pages repository')

    expect(verify).toBeGreaterThanOrEqual(0)
    expect(verify).toBeLessThan(push)
    const run = publish.slice(verify, push)
    expect(run).toContain('demo-pairing.json')
    expect(run).toContain('coreCommit')
    expect(run).toContain('uiCommit')
    expect(run).toContain('siteDigest')
  })

  it('mounts no production secret in the build job', () => {
    // The build job runs the recording scripts and the verification. A secret
    // available there would let a test-time step publish or deploy; only the
    // gated publish job sees the deploy key.
    expect(buildJob()).not.toContain('secrets.')
    expect(buildJob()).not.toContain('PAGES_TOKEN')
    expect(source.slice(source.indexOf('\n  publish:\n'))).toContain(
      'DEMOS_PAGES_TOKEN',
    )
  })
})
