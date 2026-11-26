/**
 * Admin must stay usable when the OS forces a high-contrast palette.
 *
 * In `forced-colors: active` the browser overrides author colours with system
 * colours, but it does not invent a colour where the author said `transparent`.
 * Admin draws several controls with `border: 1px solid transparent` and only
 * reveals the border through a background change on hover — under forced
 * colours the border never appeared, so a focused button and an idle one looked
 * identical.
 *
 * The fix is `forced-color-adjust` / an explicit `ButtonBorder` where a border
 * carries meaning. This test reads the stylesheets as text: the property is
 * static, and a browser test would need a Windows high-contrast runner.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/*
 * The stylesheets moved with the application.
 *
 * This read `examples/admin/src/styles` until that app was removed. The same
 * three files — `tokens.css`, `base.css`, `pages.css` — are in the migrated
 * Admin, so the assertion keeps its subject and only changes where it reads it.
 *
 * The path crosses into a sibling checkout. Where that checkout is absent the
 * suite skips rather than fails: this repository no longer contains the
 * stylesheets, and a test that cannot see its subject should say so instead of
 * reporting a regression.
 */
const root = path.resolve(import.meta.dirname, '../../../..')
const stylesDir = path.join(root, 'zeus-ecosystem/apps/admin/src/styles')
const present = fs.existsSync(stylesDir)
const styles = present
  ? ['tokens.css', 'base.css', 'pages.css'].map(name => ({
      name,
      css: fs.readFileSync(path.join(stylesDir, name), 'utf8'),
    }))
  : []

describe.skipIf(!present)('Admin forced-colors support', () => {
  it('has a forced-colors block that re-states borders', () => {
    const combined = styles.map(style => style.css).join('\n')
    expect(
      /@media\s*\(forced-colors:\s*active\)/.test(combined),
      'no @media (forced-colors: active) block exists, so transparent borders vanish',
    ).toBe(true)
  })

  it('uses a system colour for the border it re-states', () => {
    const combined = styles.map(style => style.css).join('\n')
    const block =
      /@media\s*\(forced-colors:\s*active\)\s*\{([\s\S]*?)\n\}/.exec(combined)
    expect(block, 'the forced-colors block must be readable').not.toBeNull()
    expect(
      block![1],
      'the block must name a CSS system colour such as ButtonBorder',
    ).toMatch(/ButtonBorder|CanvasText|Highlight/)
  })

  it('keeps reduced-motion support', () => {
    const combined = styles.map(style => style.css).join('\n')
    expect(combined).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
  })
})
