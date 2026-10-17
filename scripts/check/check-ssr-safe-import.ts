import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('../..', import.meta.url))
const runtimeSSR = new URL(
  './packages/core/runtime-ssr/dist/runtime-ssr.esm-bundler.js',
  pathToFileURL(`${root}/`).href,
).href
const zeusServer = new URL(
  './packages/core/zeus/dist/server.js',
  pathToFileURL(`${root}/`).href,
).href
const source = `
  import { renderToString } from ${JSON.stringify(zeusServer)}
  import { ssrElement, ssrAttr, ssrText } from ${JSON.stringify(runtimeSSR)}
  const domGlobals = ['document', 'window', 'HTMLElement', 'Node', 'customElements', 'MutationObserver']
  const availableDomGlobals = domGlobals.filter(name => name in globalThis)
  if (availableDomGlobals.length > 0) {
    throw new Error('SSR safe-import check unexpectedly found DOM globals: ' + availableDomGlobals.join(', '))
  }
  if (renderToString(() => ssrElement('main', [ssrAttr('id', 'ssr')], ssrText('ok'))) !== '<main id="ssr">ok</main>') {
    throw new Error('SSR safe-import check rendered an unexpected result')
  }
`

const result = spawnSync(
  process.execPath,
  ['--input-type=module', '--eval', source],
  {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)

if (result.status !== 0) {
  process.stderr.write(result.stderr)
  process.exit(result.status ?? 1)
}

console.log('SSR safe import and primitive render check passed.')
