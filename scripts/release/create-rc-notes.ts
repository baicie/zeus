import fs from 'node:fs/promises'
import path from 'node:path'

/**
 * Generates RC (Release Candidate) notes from benchmark results.
 *
 * Usage: tsx scripts/release/create-rc-notes.ts
 *
 * Output: temp/release/component-host-rc.md
 */
async function main() {
  const benchmarkPath = 'temp/bench/component-host/report.md'

  const sections: string[] = []

  sections.push('# Zeus Component Compiler Host RC Notes')
  sections.push('')
  sections.push('## Included in this RC')
  sections.push('')
  sections.push('- Runtime Host / Slot enhancements (Phase 0-1)')
  sections.push('- Component analyzer (Phase 2)')
  sections.push('- Bundler plugin host (Phase 3)')
  sections.push('- Web Component output (Phase 4)')
  sections.push('- Component DTS generator (Phase 5)')
  sections.push('- React / Vue wrappers (Phase 6)')
  sections.push('- Headless primitives (Phase 7)')
  sections.push('- Benchmark & quality gates (Phase 8)')
  sections.push('- Icon no-runtime output (Phase 9)')
  sections.push('- Registry CLI (Phase 10)')
  sections.push('- Docs, smoke tests, RC tooling (Phase 11)')
  sections.push('')

  sections.push('## Validation steps')
  sections.push('')
  sections.push('- `pnpm build`')
  sections.push('- `pnpm build-dts`')
  sections.push('- `pnpm check`')
  sections.push('- `pnpm test-unit`')
  sections.push('- `pnpm bench:component-host`')
  sections.push('- `pnpm examples:check:all`')
  sections.push('- `pnpm check:exports`')
  sections.push('')

  try {
    const benchmark = await fs.readFile(benchmarkPath, 'utf-8')
    sections.push('## Benchmark')
    sections.push('')
    sections.push(benchmark)
  } catch {
    sections.push('## Benchmark')
    sections.push('')
    sections.push(
      '*Benchmark report not found. Run `pnpm bench:component-host` to generate.*',
    )
  }

  await fs.mkdir('temp/release', { recursive: true })

  const outPath = path.join('temp/release', 'component-host-rc.md')
  await fs.writeFile(outPath, `${sections.join('\n')}\n`, 'utf-8')

  console.log(`RC notes written to: ${outPath}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
