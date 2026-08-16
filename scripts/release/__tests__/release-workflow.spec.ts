import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../..')

describe('release workflows', () => {
  it('keeps the shared canary channel main-only and globally serialized', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/release-canary.yml'),
      'utf8',
    )

    expect(workflow).toContain('branches:\n      - main')
    expect(workflow).not.toMatch(
      /- (feat|fix|refactor|chore|docs|test|release|hotfix)\/\*\*/,
    )
    expect(workflow).toContain('group: npm-release')
    expect(workflow).toContain('cancel-in-progress: false')
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain('pnpm release:verify:native-latest')
    expect(workflow).toContain('needs: release-preflight')
  })

  it('serializes Canary and tagged releases through one npm writer lock', () => {
    for (const file of ['release-canary.yml', 'release.yml']) {
      const workflow = readFileSync(
        resolve(root, `.github/workflows/${file}`),
        'utf8',
      )

      expect(workflow).toContain('group: npm-release')
      expect(workflow).toContain('cancel-in-progress: false')
    }
  })

  it('guards the main head before canary publication', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/release-canary.yml'),
      'utf8',
    )

    expect(workflow).toContain('pnpm release:verify:main-head')
    expect(workflow.indexOf('pnpm release:verify:main-head')).toBeLessThan(
      workflow.indexOf('pnpm release:canary'),
    )
    expect(workflow).toContain('pnpm release:promote:canary')
    expect(workflow).toContain('--tag "$ZEUS_CANARY_STAGING_TAG"')
    expect(workflow.indexOf('--tag "$ZEUS_CANARY_STAGING_TAG"')).toBeLessThan(
      workflow.indexOf('pnpm release:promote:canary'),
    )
  })

  it('checks dist-tags and registry installation after publication', () => {
    for (const file of ['release-canary.yml', 'release.yml']) {
      const workflow = readFileSync(
        resolve(root, `.github/workflows/${file}`),
        'utf8',
      )

      expect(workflow).toContain('pnpm release:verify:dist-tags')
      expect(workflow).toContain('pnpm release:smoke:compiler')
      expect(workflow).toContain('--sha "$GITHUB_SHA"')
      expect(workflow).toContain('--workflow-path .github/workflows/')
    }
  })

  it('reruns the native matrix when its release smoke contract changes', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/compiler-native.yml'),
      'utf8',
    )

    for (const path of [
      '.github/workflows/compiler-native.yml',
      'scripts/release/compiler-smoke-runner.mjs',
      'scripts/release/smoke-compiler-install.ts',
      'scripts/release/sync-native-loader.ts',
      'scripts/release.config.ts',
    ]) {
      expect(workflow).toContain(`- '${path}'`)
    }
  })

  it('executes the musl install smoke in a real musl runtime', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/compiler-native.yml'),
      'utf8',
    )

    expect(workflow).toContain('if: matrix.musl != true')
    expect(workflow).toContain('if: matrix.musl == true')
    expect(workflow).toContain(
      '--container-image node:24.16.0-alpine3.23@sha256:2bdb65ed1dab192432bc31c95f94155ca5ad7fc1392fb7eb7526ab682fa5bf14',
    )
  })

  it('awaits the compiler build entry used by Windows native jobs', () => {
    const buildScript = readFileSync(
      resolve(root, 'scripts/bundler/build.ts'),
      'utf8',
    )

    expect(buildScript).toMatch(/\nawait run\(\)\n/)
  })

  it('rejects polluted native latest tags before a tagged release publishes', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/release.yml'),
      'utf8',
    )

    expect(workflow).toContain('pnpm release:verify:native-latest')
    expect(workflow.indexOf('pnpm release:verify:native-latest')).toBeLessThan(
      workflow.indexOf('pnpm release --publishOnly'),
    )
  })

  it('dispatches canary only after both registry smoke jobs pass', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/release-canary.yml'),
      'utf8',
    )

    expect(workflow).toContain(
      'needs: [release-canary, compiler-registry-smoke]',
    )
    expect(workflow).toContain(
      'CANARY_VERSION: ${{ needs.release-canary.outputs.version }}',
    )
    const dispatchJob = workflow.slice(workflow.indexOf('dispatch-canary:'))
    expect(dispatchJob.indexOf('pnpm release:verify:main-head')).toBeLessThan(
      dispatchJob.indexOf('gh api --method POST'),
    )
  })

  it('only publishes release tags reachable from main', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/release.yml'),
      'utf8',
    )

    expect(workflow).toContain('fetch-depth: 0')
    expect(workflow).toContain('pnpm release:verify:tag-source')
    expect(workflow.indexOf('pnpm release:verify:tag-source')).toBeLessThan(
      workflow.indexOf('pnpm release:precheck'),
    )
  })

  it('creates a GitHub release only after both registry smoke jobs pass', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/release.yml'),
      'utf8',
    )

    expect(workflow).toContain('needs: [release, compiler-registry-smoke]')
    expect(workflow.indexOf('github-release:')).toBeGreaterThan(
      workflow.indexOf('compiler-registry-smoke:'),
    )
  })

  it('keeps native latest repair manual, confirmed and serialized', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/repair-native-latest.yml'),
      'utf8',
    )

    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).not.toContain('push:')
    expect(workflow).not.toContain('schedule:')
    expect(workflow).toContain('group: npm-release')
    expect(workflow).toContain("github.ref == 'refs/heads/main'")
    expect(workflow).toContain("format('remove-native-latest:{0}'")
    expect(workflow).toContain('pnpm release:cleanup:native-latest')
    expect(workflow).toContain(
      'EXPECTED_VERSION: ${{ inputs.expected_version }}',
    )
    expect(workflow).toContain('CONFIRMATION: ${{ inputs.confirmation }}')
    expect(workflow).not.toMatch(
      /run:[\s\S]*--expected-version "\$\{\{ inputs\.expected_version \}\}"/,
    )
  })

  it('verifies the promoted canary before best-effort staging cleanup', () => {
    const workflow = readFileSync(
      resolve(root, '.github/workflows/release-canary.yml'),
      'utf8',
    )

    const verify = workflow.indexOf(
      'Verify promoted Canary dist-tags and provenance',
    )
    const cleanup = workflow.indexOf('Clean Canary staging dist-tags')
    expect(verify).toBeGreaterThan(-1)
    expect(cleanup).toBeGreaterThan(verify)

    const cleanupStep = workflow.slice(cleanup)
    expect(cleanupStep).toContain('continue-on-error: true')
    expect(cleanupStep).toContain('pnpm release:cleanup:canary-staging')
  })
})
