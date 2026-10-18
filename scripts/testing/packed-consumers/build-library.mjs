import assert from 'node:assert/strict'
import fs from 'node:fs'
import { rollup } from 'rollup'
import zeus from '@zeus-js/bundler-plugin/rollup'
import { componentLibrary } from '@zeus-js/web-c'

const bundle = await rollup({
  input: 'src/index.ts',
  external: id => /^(react|vue|@zeus-js\/)/.test(id) && !id.startsWith('zeus:'),
  plugins: [
    zeus({
      root: process.cwd(),
      transpile: true,
      dts: true,
      components: { include: ['src/component.tsx'] },
      plugins: componentLibrary({ styles: false }),
    }),
  ],
})
await bundle.write({ dir: 'dist', format: 'esm' })
await bundle.close()

const manifest = JSON.parse(
  fs.readFileSync('dist/zeus.components.json', 'utf8'),
)
const lightPanel = manifest.components.find(
  component => component.tag === 'z-packed-light-panel',
)
assert(lightPanel, 'component manifest omitted the light panel')
assert.deepEqual(lightPanel.hostAttributes, ['data-theme'])
assert.deepEqual(lightPanel.cssParts, ['body'])
assert.deepEqual(lightPanel.cssVars['--packed-light-accent'], {
  name: '--packed-light-accent',
  description: 'Accent used by the light DOM panel.',
})

const customElements = JSON.parse(
  fs.readFileSync('dist/custom-elements.json', 'utf8'),
)
const lightPanelDeclaration = customElements.modules
  .flatMap(module => module.declarations)
  .find(declaration => declaration.tagName === 'z-packed-light-panel')
assert(
  lightPanelDeclaration,
  'custom-elements manifest omitted the light panel',
)
assert.deepEqual(lightPanelDeclaration.cssParts, [{ name: 'body' }])
assert.deepEqual(lightPanelDeclaration.cssProperties, [
  {
    name: '--packed-light-accent',
    description: 'Accent used by the light DOM panel.',
  },
])
