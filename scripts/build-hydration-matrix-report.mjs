import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const templatePath = 'docs/progress/hydration-browser-matrix-results.md'
const outputDir = 'temp'
const markdownOutputPath = `${outputDir}/hydration-browser-matrix-results.md`
const jsonOutputPath = `${outputDir}/hydration-browser-matrix-results.json`

const now = new Date().toISOString()
const browsers = process.env.HYDRATION_BROWSERS || 'chromium'
const sha = process.env.GITHUB_SHA || ''
const runner = process.env.GITHUB_RUNNER_OS || 'github-actions'

let markdown = readFileSync(templatePath, 'utf8')
markdown = markdown
  .replace('Date:', `Date: ${now}`)
  .replace('Commit:', `Commit: ${sha}`)
  .replace('Runner:', `Runner: ${runner}`)
  .replace(
    '| Chromium | Puppeteer/Playwright | | |',
    '| Chromium | Puppeteer/Playwright | pending | auto-generated |',
  )
  .replace(
    '| Firefox | Playwright | | |',
    `| Firefox | Playwright | pending | selected: ${browsers} |`,
  )
  .replace(
    '| WebKit | Playwright | | |',
    `| WebKit | Playwright | pending | selected: ${browsers} |`,
  )

mkdirSync(outputDir, { recursive: true })
writeFileSync(markdownOutputPath, markdown)

const json = {
  date: now,
  commit: sha,
  runner,
  browsers,
  report_markdown_path: markdownOutputPath,
}
writeFileSync(jsonOutputPath, JSON.stringify(json, null, 2))
