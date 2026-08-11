'use strict'

const assert = require('node:assert/strict')
const {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const test = require('node:test')

const { originalPositionFor, TraceMap } = require('@jridgewell/trace-mapping')
const { JSDOM } = require('jsdom')

const { transformModule } = require('../index.js')

const repositoryRoot = path.resolve(__dirname, '../../../..')
const source = `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'

const [name, setName] = createSignal('Ada')
const props = { get name() { return name() } }
let executions = 0
let nestedExecutions = 0
let bindingExecutions = 0
let specialExecutions = 0
const inputRef = { value: null as HTMLInputElement | null }
const eventCalls: string[] = []
const eventCurrentTargets: Array<string | null> = []
let memberReceiverMatches = false

const recordEvent = (name: string, event: Event) => {
  eventCalls.push(name)
  eventCurrentTargets.push(
    (event.currentTarget as Element | null)?.getAttribute('data-event') ?? null,
  )
}

const identifierHandler = (event: Event) => recordEvent('identifier', event)
const memberHandler = {
  handle(event: Event) {
    memberReceiverMatches = this === memberHandler
    recordEvent('member', event)
  },
}
const optionalHandler = {
  handle(event: Event) {
    recordEvent('optional', event)
  },
}
const computedHandlers = {
  click(event: Event) {
    recordEvent('computed', event)
  },
}

export const App = (props: { name: string }) => (
  executions++,
  <div class="greeting">\u{1f600}\u{4e2d} Hello {props.name}</div>
)

export const Nested = (props: { name: string }) => (
  nestedExecutions++,
  <section>{props.name}<span>{props.name}</span>{props.name}</section>
)

export const Static = () => (
  <p title='A &quot; B &amp; C'>A &amp; &#x1F600;</p>
)

export const Table = (props: { name: string }) => (
  <table><tr><td>{props.name}</td></tr></table>
)

export const Icon = (props: { name: string }) => (
  <svg viewBox="0 0 10 10"><circle data-radius={props.name} /></svg>
)

export const Special = (props: { name: string }) => (
  specialExecutions++,
  <main>
    <script>const amp = "a&b";{props.name}</script>
    <style>.x: color red; {props.name}</style>
    <textarea>prefix {props.name}</textarea>
    <title>prefix {props.name}</title>
    <z-card data-name={props.name}><input disabled /></z-card>
    <img alt="pixel" />
  </main>
)

export const Bindings = (props: { name: string }) => (
  bindingExecutions++,
  <section
    data-zeus-node="user"
    title={props.name}
    class={{ initial: props.name === 'Ada', updated: props.name === 'Grace' }}
    style={() => ({ color: props.name === 'Ada' ? 'red' : 'blue', lineHeight: 1 })}
  >
    <input prop:value={props.name} ref={inputRef} />
    <table><tr data-name={props.name}><td>bound</td></tr></table>
    <button data-event="inline" onClick={event => recordEvent('inline', event)}>inline</button>
    <button data-event="identifier" onClick={identifierHandler}>identifier</button>
    <button data-event="member" onClick={memberHandler.handle}>member</button>
    <button data-event="optional" onClick={optionalHandler?.handle}>optional</button>
    <button data-event="computed" onClick={computedHandlers['click']}>computed</button>
  </section>
)

export const mount = () => App(props)
export const mountNested = () => Nested(props)
export const mountStatic = () => Static()
export const mountTable = () => Table(props)
export const mountIcon = () => Icon(props)
export const mountSpecial = () => Special(props)
export const mountBindings = (container: Element) => render(() => Bindings(props), container)
export const updateName = setName
export const executionCount = () => executions
export const nestedExecutionCount = () => nestedExecutions
export const bindingExecutionCount = () => bindingExecutions
export const specialExecutionCount = () => specialExecutions
export const inputRefValue = () => inputRef.value
export const eventCallLog = () => [...eventCalls]
export const eventCurrentTargetLog = () => [...eventCurrentTargets]
export const hasCorrectMemberReceiver = () => memberReceiverMatches
`.replaceAll('\n', '\r\n')

test('native compiler executes through Vite with fine-grained DOM updates', async () => {
  const fixture = createFixture()
  const restoreDOM = installDOMGlobals()
  const { build, createServer } = await import('vite')
  const plugin = createNativePlugin()
  const server = await createServer({
    root: fixture.root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    define: {
      __DEV__: 'true',
      __TEST__: 'true',
      __VERSION__: JSON.stringify('test'),
    },
    resolve: { alias: runtimeAliases() },
    plugins: [plugin],
    server: { middlewareMode: true },
  })

  try {
    const transformed = await server.transformRequest('/src/App.tsx')
    assert.ok(transformed?.map)
    assertNoRawJSX(transformed.code)
    assertExpressionMapping(transformed.code, transformed.map)

    const module = await server.ssrLoadModule('/src/App.tsx')
    const element = module.mount()
    const nested = module.mountNested()
    const staticElement = module.mountStatic()
    const table = module.mountTable()
    const icon = module.mountIcon()
    const special = module.mountSpecial()
    const bindingContainer = document.createElement('div')
    document.body.append(bindingContainer)
    const disposeBindings = module.mountBindings(bindingContainer)
    const bindings = bindingContainer.firstElementChild
    const bindingInput = bindings.querySelector('input')
    const bindingRow = bindings.querySelector('tr')
    const greetingLabel = element.firstChild
    const greetingValue = element.lastChild
    const nestedSpan = nested.querySelector('span')
    const nestedValue = nestedSpan.firstChild

    assert.equal(
      element.outerHTML,
      '<div class="greeting">\u{1f600}\u{4e2d} Hello Ada</div>',
    )
    assert.equal(nested.outerHTML, '<section>Ada<span>Ada</span>Ada</section>')
    assert.equal(staticElement.getAttribute('title'), 'A " B & C')
    assert.equal(staticElement.textContent, 'A & \u{1f600}')
    assert.equal(
      table.outerHTML,
      '<table><tbody><tr><td>Ada</td></tr></tbody></table>',
    )
    assert.equal(icon.namespaceURI, 'http://www.w3.org/2000/svg')
    assert.equal(
      icon.firstElementChild.namespaceURI,
      'http://www.w3.org/2000/svg',
    )
    assert.equal(icon.firstElementChild.getAttribute('data-radius'), 'Ada')
    assert.equal(
      special.querySelector('script').textContent,
      'const amp = "a&b";Ada',
    )
    assert.equal(
      special.querySelector('style').textContent,
      '.x: color red; Ada',
    )
    assert.equal(special.querySelector('textarea').textContent, 'prefix Ada')
    assert.equal(special.querySelector('title').textContent, 'prefix Ada')
    assert.equal(
      special.querySelector('z-card').namespaceURI,
      'http://www.w3.org/1999/xhtml',
    )
    assert.equal(
      special.querySelector('z-card').getAttribute('data-name'),
      'Ada',
    )
    assert.equal(
      special.querySelector('z-card input').hasAttribute('disabled'),
      true,
    )
    assert.equal(special.querySelector('img').hasAttribute('alt'), true)
    assert.equal(module.specialExecutionCount(), 1)
    assert.equal(bindings.getAttribute('data-zeus-node'), 'user')
    assert.equal(bindings.getAttribute('title'), 'Ada')
    assert.equal(bindings.getAttribute('class'), 'initial')
    assert.equal(bindings.style.color, 'red')
    assert.equal(bindings.style.lineHeight, '1')
    assert.equal(bindingInput.value, 'Ada')
    assert.equal(bindingRow.getAttribute('data-name'), 'Ada')
    assert.equal(bindingRow.parentElement.tagName, 'TBODY')
    assert.strictEqual(module.inputRefValue(), bindingInput)
    assert.equal(module.executionCount(), 1)
    assert.equal(module.nestedExecutionCount(), 1)
    assert.equal(module.bindingExecutionCount(), 1)

    const eventButtons = Array.from(bindings.querySelectorAll('[data-event]'))
    for (const button of eventButtons) {
      button.dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    }
    assert.deepEqual(module.eventCallLog(), [
      'inline',
      'identifier',
      'member',
      'optional',
      'computed',
    ])
    assert.deepEqual(module.eventCurrentTargetLog(), [
      'inline',
      'identifier',
      'member',
      'optional',
      'computed',
    ])
    assert.equal(module.hasCorrectMemberReceiver(), true)

    module.updateName('Grace')

    assert.equal(
      element.outerHTML,
      '<div class="greeting">\u{1f600}\u{4e2d} Hello Grace</div>',
    )
    assert.equal(
      nested.outerHTML,
      '<section>Grace<span>Grace</span>Grace</section>',
    )
    assert.equal(
      table.outerHTML,
      '<table><tbody><tr><td>Grace</td></tr></tbody></table>',
    )
    assert.equal(icon.firstElementChild.getAttribute('data-radius'), 'Grace')
    assert.equal(
      special.querySelector('script').textContent,
      'const amp = "a&b";Grace',
    )
    assert.equal(
      special.querySelector('style').textContent,
      '.x: color red; Grace',
    )
    assert.equal(special.querySelector('textarea').textContent, 'prefix Grace')
    assert.equal(special.querySelector('title').textContent, 'prefix Grace')
    assert.equal(
      special.querySelector('z-card').getAttribute('data-name'),
      'Grace',
    )
    assert.equal(module.specialExecutionCount(), 1)
    assert.equal(bindings.getAttribute('title'), 'Grace')
    assert.equal(bindings.getAttribute('class'), 'updated')
    assert.equal(bindings.style.color, 'blue')
    assert.equal(bindings.style.lineHeight, '1')
    assert.equal(bindingInput.value, 'Grace')
    assert.equal(bindingRow.getAttribute('data-name'), 'Grace')
    assert.strictEqual(bindings.querySelector('input'), bindingInput)
    assert.strictEqual(bindings.querySelector('tr'), bindingRow)
    assert.strictEqual(element.firstChild, greetingLabel)
    assert.strictEqual(element.lastChild, greetingValue)
    assert.strictEqual(nested.querySelector('span'), nestedSpan)
    assert.strictEqual(nestedSpan.firstChild, nestedValue)
    assert.equal(module.executionCount(), 1)
    assert.equal(module.nestedExecutionCount(), 1)
    assert.equal(module.bindingExecutionCount(), 1)

    disposeBindings()
    assert.equal(bindingContainer.textContent, '')
    assert.equal(module.inputRefValue(), null)

    document.body.append(bindings)
    eventButtons[0].dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    assert.equal(module.eventCallLog().length, 5)
    bindings.remove()
    bindingContainer.remove()

    const buildResult = await build({
      root: fixture.root,
      configFile: false,
      logLevel: 'silent',
      define: {
        __DEV__: 'true',
        __TEST__: 'true',
        __VERSION__: JSON.stringify('test'),
      },
      resolve: { alias: runtimeAliases() },
      plugins: [createNativePlugin()],
      build: {
        lib: { entry: fixture.entry, formats: ['es'] },
        minify: false,
        sourcemap: true,
        write: false,
      },
    })
    const chunk = findChunk(buildResult)
    assertNoRawJSX(chunk.code)
    assert.ok(chunk.map)
    assertExpressionMapping(chunk.code, chunk.map)
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler preserves root and nested Fragment identity', async () => {
  const fragmentSource = `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'

const [value, setValue] = createSignal('one')
let executions = 0

const FragmentApp = () => (
  executions++,
  <><span>left</span><strong>{value()}</strong><><em>nested</em>{value()}</></>
)

export const mount = () => FragmentApp()
export const mountInto = (container: Element) => render(() => FragmentApp(), container)
export const update = setValue
export const executionCount = () => executions
`.replaceAll('\n', '\r\n')
  const fixture = createFixture(fragmentSource)
  const restoreDOM = installDOMGlobals()
  const { createServer } = await import('vite')
  const server = await createServer({
    root: fixture.root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    define: {
      __DEV__: 'true',
      __TEST__: 'true',
      __VERSION__: JSON.stringify('test'),
    },
    resolve: { alias: runtimeAliases() },
    plugins: [createNativePlugin()],
    server: { middlewareMode: true },
  })

  try {
    const module = await server.ssrLoadModule('/src/App.tsx')
    const fragment = module.mount()
    const initialNodes = Array.from(fragment.childNodes)
    assert.deepEqual(
      initialNodes.map(node => node.nodeName),
      ['SPAN', 'STRONG', 'EM', '#text'],
    )
    assert.equal(fragment.textContent, 'leftonenestedone')
    assert.equal(module.executionCount(), 1)

    const container = document.createElement('div')
    const dispose = module.mountInto(container)
    const strong = container.querySelector('strong')
    const nested = container.querySelector('em')
    assert.equal(container.textContent, 'leftonenestedone')

    module.update('two')
    assert.equal(container.textContent, 'lefttwonestedtwo')
    assert.strictEqual(container.querySelector('strong'), strong)
    assert.strictEqual(container.querySelector('em'), nested)
    assert.equal(module.executionCount(), 2)

    dispose()
    assert.equal(container.childNodes.length, 0)
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler initializes components once with lazy props and children', async () => {
  const componentSource = `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'

const [name, setName] = createSignal('Ada')
let appExecutions = 0
let childExecutions = 0

const Child = props => (
  childExecutions++,
  props.children
)

const App = () => (
  appExecutions++,
  <section><Child title={name()}><span>{name()}</span></Child></section>
)

export const mount = (container: Element) => render(() => App(), container)
export const update = setName
export const appExecutionCount = () => appExecutions
export const childExecutionCount = () => childExecutions
`.replaceAll('\n', '\r\n')
  const fixture = createFixture(componentSource)
  const restoreDOM = installDOMGlobals()
  const { createServer } = await import('vite')
  const server = await createServer({
    root: fixture.root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    define: {
      __DEV__: 'true',
      __TEST__: 'true',
      __VERSION__: JSON.stringify('test'),
    },
    resolve: { alias: runtimeAliases() },
    plugins: [createNativePlugin()],
    server: { middlewareMode: true },
  })

  try {
    const module = await server.ssrLoadModule('/src/App.tsx')
    const container = document.createElement('div')
    const dispose = module.mount(container)
    const childSpan = container.querySelector('span')

    assert.equal(container.textContent, 'Ada')
    assert.equal(module.appExecutionCount(), 1)
    assert.equal(module.childExecutionCount(), 1)

    module.update('Grace')

    assert.equal(container.textContent, 'Grace')
    assert.strictEqual(container.querySelector('span'), childSpan)
    assert.equal(module.appExecutionCount(), 1)
    assert.equal(module.childExecutionCount(), 1)

    dispose()
    assert.equal(container.childNodes.length, 0)
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler preserves nested control flow in component children', async () => {
  const nestedControlFlowSource = `import { render, Show, For } from '@zeus-js/runtime-dom'

const Child = props => <article>{props.children}</article>
const App = props => <Child><Show when={props.visible}><span>on</span></Show><For each={props.items}>{item => <b>{item}</b>}</For></Child>

export const mount = (container: Element) => render(() => App({ visible: true, items: ['a', 'b'] }), container)
`.replaceAll('\n', '\r\n')
  const fixture = createFixture(nestedControlFlowSource)
  const restoreDOM = installDOMGlobals()
  const { createServer } = await import('vite')
  const server = await createServer({
    root: fixture.root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    define: {
      __DEV__: 'true',
      __TEST__: 'true',
      __VERSION__: JSON.stringify('test'),
    },
    resolve: { alias: runtimeAliases() },
    plugins: [createNativePlugin()],
    server: { middlewareMode: true },
  })

  try {
    const module = await server.ssrLoadModule('/src/App.tsx')
    const container = document.createElement('div')
    const dispose = module.mount(container)

    assert.equal(container.innerHTML, '<article><span>on</span><b>a</b><b>b</b></article>')

    dispose()
    assert.equal(container.childNodes.length, 0)
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler mounts Show and keyed For regions with cleanup', async () => {
  const controlFlowSource = `import { createSignal } from '@zeus-js/signal'
import { render, Show, For } from '@zeus-js/runtime-dom'

const [visible, setVisible] = createSignal(false)
const [items, setItems] = createSignal([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])

const App = () => <main><Show when={visible()} fallback={<i>off</i>}><span>on</span></Show><For each={items()} by={item => item.id}>{item => <b>{item.label}</b>}</For></main>

export const mount = (container: Element) => render(() => App(), container)
export const update = (nextVisible, nextItems) => { setVisible(nextVisible); setItems(nextItems) }
`.replaceAll('\n', '\r\n')
  const fixture = createFixture(controlFlowSource)
  const restoreDOM = installDOMGlobals()
  const { createServer } = await import('vite')
  const server = await createServer({
    root: fixture.root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    define: {
      __DEV__: 'true',
      __TEST__: 'true',
      __VERSION__: JSON.stringify('test'),
    },
    resolve: { alias: runtimeAliases() },
    plugins: [createNativePlugin()],
    server: { middlewareMode: true },
  })

  try {
    const module = await server.ssrLoadModule('/src/App.tsx')
    const container = document.createElement('div')
    const dispose = module.mount(container)
    const first = container.querySelector('b')
    const second = container.querySelectorAll('b')[1]

    assert.equal(container.textContent, 'offAB')
    module.update(true, [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' },
    ])
    assert.equal(container.textContent, 'onBA')
    assert.strictEqual(container.querySelectorAll('b')[0], second)
    assert.strictEqual(container.querySelectorAll('b')[1], first)

    dispose()
    assert.equal(container.childNodes.length, 0)
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler executes defineElement Host and Slot boundaries', async () => {
  const hostSource = `import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

export const Element = defineElement('z-native-fragment', { shadow: false, props: { tone: String } }, props => (
  <Host class={props.tone}><section><Slot /></section></Host>
))
`.replaceAll('\n', '\r\n')
  const fixture = createFixture(hostSource)
  const restoreDOM = installDOMGlobals()
  const { createServer } = await import('vite')
  const server = await createServer({
    root: fixture.root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    define: {
      __DEV__: 'true',
      __TEST__: 'true',
      __VERSION__: JSON.stringify('test'),
    },
    resolve: { alias: runtimeAliases() },
    plugins: [createNativePlugin()],
    server: { middlewareMode: true },
  })

  try {
    const module = await server.ssrLoadModule('/src/App.tsx')
    const host = document.createElement('z-native-fragment')
    host.setAttribute('tone', 'warm')
    const projected = document.createElement('strong')
    projected.textContent = 'projected'
    host.append(projected)
    document.body.append(host)

    assert.equal(host.className, 'warm')
    assert.equal(host.querySelector('section')?.textContent, 'projected')
    assert.strictEqual(host.querySelector('section strong'), projected)

    host.remove()
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler executes SSR output through runtime-ssr', async () => {
  const ssrSource = `import { renderToString } from '@zeus-js/runtime-ssr'

export const render = props => renderToString(() => <div class={props.className}>Hello {props.name}</div>)
`.replaceAll('\n', '\r\n')
  const fixture = createFixture(ssrSource)
  const restoreDOM = installDOMGlobals()
  const { createServer } = await import('vite')
  const server = await createServer({
    root: fixture.root,
    configFile: false,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    define: {
      __DEV__: 'true',
      __TEST__: 'true',
      __VERSION__: JSON.stringify('test'),
    },
    resolve: { alias: runtimeAliases() },
    plugins: [createNativePlugin('ssr')],
    server: { middlewareMode: true },
  })

  try {
    const module = await server.ssrLoadModule('/src/App.tsx')
    assert.equal(module.render({ className: 'greeting', name: 'Ada' }), '<div class="greeting">Hello Ada</div>')
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

function createNativePlugin(target = 'dom') {
  return {
    name: 'zeus-native-compiler-test',
    enforce: 'pre',
    transform(code, id) {
      const filename = id.replace(/[?#].*$/, '')
      if (!filename.endsWith('.tsx')) return null

      const result = transformModule({
        source: code,
        filename: path.basename(filename),
        target,
        runtimeModule:
          target === 'ssr' ? '@zeus-js/runtime-ssr' : '@zeus-js/runtime-dom',
        delegateEvents: true,
        sourceMap: true,
      })
      if (result.diagnostics.length > 0) {
        throw new Error(JSON.stringify(result.diagnostics))
      }
      return { code: result.code, map: result.map }
    },
  }
}

function createFixture(sourceCode = source) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'zeus-native-')))
  mkdirSync(path.join(root, 'src'))
  const entry = path.join(root, 'src', 'App.tsx')
  writeFileSync(entry, sourceCode)
  return { root, entry }
}

function runtimeAliases() {
  return [
    {
      find: '@zeus-js/runtime-dom',
      replacement: path.join(
        repositoryRoot,
        'packages/core/runtime-dom/src/index.ts',
      ),
    },
    {
      find: '@zeus-js/runtime-ssr',
      replacement: path.join(
        repositoryRoot,
        'packages/core/runtime-ssr/src/index.ts',
      ),
    },
    {
      find: '@zeus-js/signal/internal',
      replacement: path.join(
        repositoryRoot,
        'packages/core/signal/src/internal.ts',
      ),
    },
    {
      find: '@zeus-js/signal',
      replacement: path.join(
        repositoryRoot,
        'packages/core/signal/src/index.ts',
      ),
    },
    {
      find: '@zeus-js/shared',
      replacement: path.join(
        repositoryRoot,
        'packages/core/shared/src/index.ts',
      ),
    },
  ]
}

function installDOMGlobals() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const keys = [
    'window',
    'document',
    'Node',
    'Element',
    'HTMLElement',
    'SVGElement',
    'DocumentFragment',
    'Comment',
    'Text',
    'CustomEvent',
    'Event',
    'MutationObserver',
    'customElements',
  ]
  const previous = new Map()

  for (const key of keys) {
    previous.set(key, globalThis[key])
    globalThis[key] = key === 'window' ? dom.window : dom.window[key]
  }

  return () => {
    for (const key of keys) {
      if (previous.get(key) === undefined) delete globalThis[key]
      else globalThis[key] = previous.get(key)
    }
    dom.window.close()
  }
}

function assertNoRawJSX(code) {
  assert.doesNotMatch(code, /=>\s*\(\s*<div/)
  assert.doesNotMatch(code, /return\s+<div/)
}

function assertExpressionMapping(code, map) {
  const generatedIndex = code.indexOf('props.name')
  assert.notEqual(generatedIndex, -1)
  const originalIndex = source.indexOf('props.name}</div>')
  const traced = originalPositionFor(
    new TraceMap(map),
    positionOf(code, generatedIndex),
  )
  const original = positionOf(source, originalIndex)

  assert.equal(traced.line, original.line)
  assert.equal(traced.column, original.column)
  assert.match(traced.source, /App\.tsx$/)
}

function positionOf(code, index) {
  const lines = code.slice(0, index).split('\n')
  return { line: lines.length, column: lines.at(-1).length }
}

function findChunk(result) {
  const outputs = Array.isArray(result) ? result : [result]
  const chunk = outputs
    .flatMap(output => output.output)
    .find(output => output.type === 'chunk')
  assert.ok(chunk)
  return chunk
}
