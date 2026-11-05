import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')
const workflow = readFileSync(
  resolve(root, '.github/workflows/release-canary.yml'),
  'utf8',
)

function job(name: string): string {
  const startMatch = new RegExp(`\\n  ${name}:\\n`).exec(workflow)
  if (!startMatch) throw new Error(`Missing workflow job: ${name}`)
  const start = startMatch.index
  const rest = workflow.slice(start + startMatch[0].length)
  const next = /\n  [A-Za-z0-9_-]+:\n/.exec(rest)
  return workflow.slice(
    start,
    next ? start + startMatch[0].length + next.index : undefined,
  )
}

describe('canary publication gates', () => {
  it('runs a no-side-effect dry-run on main pushes', () => {
    const dryRun = job('canary-dry-run')

    expect(dryRun).toContain("github.event_name == 'push'")
    expect(dryRun).toContain('pnpm release:canary --dry-run-only')
    expect(dryRun).not.toContain('release:promote:canary')
    expect(dryRun).not.toContain('release:verify:published')
    expect(dryRun).not.toContain('release:verify:npm-auth')
    expect(dryRun).not.toContain('gh api --method POST')
    expect(dryRun).not.toContain('NPM_TOKEN')
  })

  it('makes real canary publication manual and environment-gated', () => {
    const real = job('release-canary')

    expect(real).toContain("github.event_name == 'workflow_dispatch'")
    expect(real).toContain("inputs.mode == 'publish'")
    expect(real).toContain('environment: Canary')
    expect(real).toContain('pnpm release:canary')
    expect(real).toContain('NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}')
  })

  it('declares dry-run as the default manual mode', () => {
    expect(workflow).toContain('default: dry-run')
    expect(workflow).toContain('type: choice')
  })
})
