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
const stripHydrationMarkers = html =>
  html.replace(/<!--zeus:hydrate:[^>]+-->/g, '')
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
    style={{ color: props.name === 'Ada' ? 'red' : 'blue', lineHeight: 1 }}
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

export const OnceBindings = (props: { name: string }) => (
  <section
    title={once(props.name)}
    class={once({ initial: props.name === 'Ada', updated: props.name === 'Grace' })}
    style={once({ color: props.name === 'Ada' ? 'red' : 'blue', lineHeight: 1 })}
  >
    <b>{once(props.name)}</b>
    <input prop:value={once(props.name)} />
    <textarea>{once(props.name)}</textarea>
    <span data-name={props.name}>{props.name}</span>
  </section>
)

export const mount = () => App(props)
export const mountNested = () => Nested(props)
export const mountStatic = () => Static()
export const mountTable = () => Table(props)
export const mountIcon = () => Icon(props)
export const mountSpecial = () => Special(props)
export const mountBindings = (container: Element) => render(() => Bindings(props), container)
export const mountOnceBindings = (container: Element) => render(() => OnceBindings(props), container)
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
    const onceBindingContainer = document.createElement('div')
    document.body.append(onceBindingContainer)
    const disposeOnceBindings = module.mountOnceBindings(onceBindingContainer)
    const bindings = bindingContainer.firstElementChild
    const onceBindings = onceBindingContainer.firstElementChild
    const bindingInput = bindings.querySelector('input')
    const bindingRow = bindings.querySelector('tr')
    const onceBindingInput = onceBindings.querySelector('input')
    const onceBindingText = onceBindings.querySelector('b')
    const onceBindingTextContent = onceBindings.querySelector('textarea')
    const reactiveBinding = onceBindings.querySelector('span')
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
    assert.equal(onceBindings.getAttribute('title'), 'Ada')
    assert.equal(onceBindings.getAttribute('class'), 'initial')
    assert.equal(onceBindings.style.color, 'red')
    assert.equal(onceBindings.style.lineHeight, '1')
    assert.equal(onceBindingText.textContent, 'Ada')
    assert.equal(onceBindingInput.value, 'Ada')
    assert.equal(onceBindingTextContent.textContent, 'Ada')
    assert.equal(reactiveBinding.getAttribute('data-name'), 'Ada')
    assert.equal(reactiveBinding.textContent, 'Ada')
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
    assert.equal(onceBindings.getAttribute('title'), 'Ada')
    assert.equal(onceBindings.getAttribute('class'), 'initial')
    assert.equal(onceBindings.style.color, 'red')
    assert.equal(onceBindings.style.lineHeight, '1')
    assert.equal(onceBindingText.textContent, 'Ada')
    assert.equal(onceBindingInput.value, 'Ada')
    assert.equal(onceBindingTextContent.textContent, 'Ada')
    assert.equal(reactiveBinding.getAttribute('data-name'), 'Grace')
    assert.equal(reactiveBinding.textContent, 'Grace')
    assert.strictEqual(onceBindings.querySelector('input'), onceBindingInput)
    assert.strictEqual(onceBindings.querySelector('b'), onceBindingText)
    assert.strictEqual(
      onceBindings.querySelector('textarea'),
      onceBindingTextContent,
    )
    assert.strictEqual(onceBindings.querySelector('span'), reactiveBinding)
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
    disposeOnceBindings()
    assert.equal(onceBindingContainer.textContent, '')

    document.body.append(bindings)
    eventButtons[0].dispatchEvent(
      new window.MouseEvent('click', { bubbles: true, cancelable: true }),
    )
    assert.equal(module.eventCallLog().length, 5)
    bindings.remove()
    bindingContainer.remove()
    onceBindingContainer.remove()

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
      ['SPAN', 'STRONG', 'EM', '#text', '#comment'],
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

test('native compiler calls member components without treating Namespace.Show as a builtin', async () => {
  const memberSource = `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'

const [label, setLabel] = createSignal('Ada')
const calls = { app: 0, button: 0, show: 0 }
const Button = props => (calls.button++, <button>{props.label}</button>)
const Show = props => (
  calls.show++,
  <aside data-kind="ordinary" data-when={props.when ? 'true' : 'false'}>{props.children}</aside>
)
const UI = { Button }
const Namespace = { Show }
const App = () => (
  calls.app++,
  <main>
    <UI.Button label={label()} />
    <Namespace.Show when={false}><span>{label()}</span></Namespace.Show>
  </main>
)
export const mount = container => render(() => App(), container)
export const update = setLabel
export const executionCounts = () => ({ ...calls })
`
  const fixture = createFixture(memberSource)
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
    const button = container.querySelector('button')
    const ordinaryShow = container.querySelector('aside[data-kind="ordinary"]')
    const child = ordinaryShow?.querySelector('span')

    assert.equal(button?.textContent, 'Ada')
    assert.equal(ordinaryShow?.getAttribute('data-when'), 'false')
    assert.equal(child?.textContent, 'Ada')
    assert.deepEqual(module.executionCounts(), { app: 1, button: 1, show: 1 })

    module.update('Grace')
    assert.equal(button.textContent, 'Grace')
    assert.equal(child.textContent, 'Grace')
    assert.strictEqual(container.querySelector('button'), button)
    assert.strictEqual(container.querySelector('aside'), ordinaryShow)
    assert.strictEqual(ordinaryShow.querySelector('span'), child)
    assert.deepEqual(module.executionCounts(), { app: 1, button: 1, show: 1 })

    dispose()
    assert.equal(container.childNodes.length, 0)
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler preserves nested control flow in component children', async () => {
  const nestedControlFlowSource =
    `import { render, Show, For } from '@zeus-js/runtime-dom'

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
    document.body.append(container)
    const dispose = module.mount(container)

    assert.equal(container.textContent, 'onab')
    assert.deepEqual(
      Array.from(container.querySelectorAll('article > *')).map(
        element => element.outerHTML,
      ),
      ['<span>on</span>', '<b>a</b>', '<b>b</b>'],
    )

    dispose()
    assert.equal(container.childNodes.length, 0)
    container.remove()
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
const calls = []

const App = () => <main><Show when={visible()} fallback={<i>off</i>}><span>on</span></Show><For each={items()} by={item => item.id}>{(item, index) => <b data-index={index} onClick={() => calls.push(item.label + ':' + index)}>{index}:{item.label}</b>}</For></main>

export const mount = (container: Element) => render(() => App(), container)
export const update = (nextVisible, nextItems) => { setVisible(nextVisible); setItems(nextItems) }
export const getCalls = () => calls
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
    document.body.append(container)
    const dispose = module.mount(container)
    const first = container.querySelector('b')
    const second = container.querySelectorAll('b')[1]

    assert.equal(container.textContent, 'off0:A1:B')
    module.update(true, [
      { id: 'b', label: 'B' },
      { id: 'a', label: 'A' },
    ])
    assert.equal(container.textContent, 'on0:B1:A')
    assert.strictEqual(container.querySelectorAll('b')[0], second)
    assert.strictEqual(container.querySelectorAll('b')[1], first)

    module.update(true, [
      { id: 'b', label: 'B next' },
      { id: 'a', label: 'A next' },
    ])
    assert.equal(container.textContent, 'on0:B next1:A next')
    assert.strictEqual(container.querySelectorAll('b')[0], second)
    assert.strictEqual(container.querySelectorAll('b')[1], first)
    assert.equal(
      container.querySelectorAll('b')[0].getAttribute('data-index'),
      '0',
    )
    assert.equal(
      container.querySelectorAll('b')[1].getAttribute('data-index'),
      '1',
    )

    container
      .querySelectorAll('b')[0]
      .dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    container
      .querySelectorAll('b')[1]
      .dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    assert.deepEqual(module.getCalls(), ['B next:0', 'A next:1'])

    dispose()
    assert.equal(container.childNodes.length, 0)
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler lowers Transition intrinsic to mountTransition', async () => {
  const transitionSource = `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'
import { Transition } from '@zeus-js/zeus'

const [visible, setVisible] = createSignal(true)
const leaveDone = []
export const mount = container => render(() => (
  <Transition when={visible()} enter="fade-in" leave="fade-out" duration={0} onLeaveDone={() => leaveDone.push('done')}>
    <span data-transition>{visible() ? 'shown' : 'hidden'}</span>
  </Transition>
), container)
export const set = setVisible
export const completed = () => [...leaveDone]
`
  const fixture = createFixture(transitionSource)
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
    document.body.append(container)
    const dispose = module.mount(container)
    const first = container.querySelector('[data-transition]')
    assert.equal(first?.textContent, 'shown')
    module.set(false)
    assert.equal(container.querySelector('[data-transition]'), null)
    assert.deepEqual(module.completed(), ['done'])
    module.set(true)
    const second = container.querySelector('[data-transition]')
    assert.equal(second?.textContent, 'shown')
    assert.notStrictEqual(second, first)
    dispose()
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler keeps root and nested For regions reactive', async () => {
  const rootForSource = `import { createSignal } from '@zeus-js/signal'
import { render, For } from '@zeus-js/runtime-dom'

const [items, setItems] = createSignal([{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }])
const [groups, setGroups] = createSignal([{ id: 'group', items: ['x'], keyFn: undefined }])
const calls = []

function createRootApp(token) {
  const expectedThis = this
  const expectedArguments = arguments
  return () => <For each={items()} by={item => item.id}>{(item, index) => <button onClick={() => calls.push([this === expectedThis, arguments === expectedArguments, item.label, index])}>{item.label}</button>}</For>
}

const RootApp = createRootApp.call({ owner: true }, 'token')
const DirectValues = () => <For each={items()} by={item => item.id}>{item => item.label}</For>
const UnicodeEscaped = () => <For each={items()} by={it\\u0065m => it\\u0065m.id}>{(it\\u0065m, ind\\u0065x) => <u data-index={ind\\u0065x}>{ind\\u0065x}:{it\\u0065m.label}</u>}</For>
const Nested = () => <section><For each={groups()} by={group => group.id}>{group => <For each={group.items} by={group.keyFn}>{item => <i>{item}</i>}</For>}</For></section>

export const mountRoot = container => render(() => RootApp(), container)
export const mountDirect = container => render(() => DirectValues(), container)
export const mountUnicodeEscaped = container => render(() => UnicodeEscaped(), container)
export const mountNested = container => render(() => Nested(), container)
export const updateItems = next => setItems(next)
export const updateGroups = next => setGroups(next)
export const getCalls = () => calls
`.replaceAll('\n', '\r\n')
  const fixture = createFixture(rootForSource)
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
    const rootContainer = document.createElement('div')
    const directContainer = document.createElement('div')
    const unicodeContainer = document.createElement('div')
    const nestedContainer = document.createElement('div')
    document.body.append(
      rootContainer,
      directContainer,
      unicodeContainer,
      nestedContainer,
    )
    const disposeRoot = module.mountRoot(rootContainer)
    const disposeDirect = module.mountDirect(directContainer)
    const disposeUnicode = module.mountUnicodeEscaped(unicodeContainer)
    const disposeNested = module.mountNested(nestedContainer)
    const firstButton = rootContainer.querySelector('button')
    const firstUnicode = unicodeContainer.querySelector('u')

    assert.equal(rootContainer.textContent, 'AB')
    assert.equal(directContainer.textContent, 'AB')
    assert.equal(unicodeContainer.textContent, '0:A1:B')
    assert.equal(nestedContainer.textContent, 'x')

    module.updateItems([
      { id: 'b', label: 'B next' },
      { id: 'a', label: 'A next' },
    ])
    module.updateGroups([{ id: 'group', items: ['y', 'z'], keyFn: undefined }])

    assert.equal(rootContainer.textContent, 'B nextA next')
    assert.equal(directContainer.textContent, 'B nextA next')
    assert.equal(unicodeContainer.textContent, '0:B next1:A next')
    assert.strictEqual(unicodeContainer.querySelectorAll('u')[1], firstUnicode)
    assert.equal(
      unicodeContainer.querySelectorAll('u')[1].getAttribute('data-index'),
      '1',
    )
    assert.equal(nestedContainer.textContent, 'yz')
    assert.strictEqual(rootContainer.querySelectorAll('button')[1], firstButton)

    rootContainer
      .querySelectorAll('button')[1]
      .dispatchEvent(
        new window.MouseEvent('click', { bubbles: true, cancelable: true }),
      )
    assert.deepEqual(module.getCalls(), [[true, true, 'A next', 1]])

    disposeNested()
    disposeUnicode()
    disposeDirect()
    disposeRoot()
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler executes defineElement Host and Slot boundaries', async () => {
  const hostSource =
    `import { defineElement, Host, Slot } from '@zeus-js/runtime-dom'

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
    assert.equal(
      stripHydrationMarkers(
        module.render({ className: 'greeting', name: 'Ada' }),
      ),
      '<div class="greeting">Hello Ada</div>',
    )
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler executes SSR Web Components with DSD, styles and slots', async () => {
  const ssrSource =
    `import { renderToString, defineElement, Host, Slot, ssrAttr, ssrElement } from '@zeus-js/runtime-ssr'

const Card = defineElement(
  'z-ssr-card',
  {
    shadow: { mode: 'open', delegatesFocus: true },
    formAssociated: true,
    styles: '.card { color: red }',
    props: {
      title: { type: String, default: 'Default title', reflect: true },
      open: { type: Boolean, reflect: true },
      value: { type: String, attr: false },
    },
  },
  props => (
    <Host class="card" aria-label={props.title}>
      <section>
        <Slot name="heading">Heading fallback</Slot>
        <Slot>Body fallback</Slot>
        <input prop:value={props.value} />
      </section>
    </Host>
  ),
)

export const render = props => renderToString(() => Card({
  ...props,
  children: props.includeChildren ? [
    ssrElement('h2', [ssrAttr('slot', 'heading')], 'Profile'),
    ssrElement('p', [], 'Details'),
  ] : undefined,
}))
`.replaceAll('\\n', '\\r\\n')
  const fixture = createFixture(ssrSource)
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
    assert.equal(
      stripHydrationMarkers(
        module.render({
          open: true,
          value: 'initial value',
          includeChildren: true,
        }),
      ),
      '<z-ssr-card title="Default title" open class="card" aria-label="Default title"><template shadowrootmode="open" shadowrootdelegatesfocus><style>.card { color: red }</style><section><slot name="heading">Heading fallback</slot><slot>Body fallback</slot><input value="initial value"></section></template><h2 slot="heading">Profile</h2><p>Details</p></z-ssr-card>',
    )
    assert.equal(
      stripHydrationMarkers(module.render({ open: false, value: 'fallback' })),
      '<z-ssr-card title="Default title" class="card" aria-label="Default title"><template shadowrootmode="open" shadowrootdelegatesfocus><style>.card { color: red }</style><section><slot name="heading">Heading fallback</slot><slot>Body fallback</slot><input value="fallback"></section></template></z-ssr-card>',
    )
  } finally {
    await server.close()
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

test('native compiler executes ordered spreads and preserves component and function identities', async () => {
  const spreadSource = `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'
const [label, setLabel] = createSignal('first')
const calls: string[] = []
const firstRef = { current: null }
const secondRef = { current: null }
const firstClick = () => calls.push('first')
const secondClick = () => calls.push('second')
const [native, setNative] = createSignal<Record<string, unknown>>({ title: 'override', onClick: firstClick, ref: firstRef })
const [child, setChild] = createSignal<Record<string, unknown>>({ title: 'child override' })
let childSetups = 0
let formatterCalls = 0
const formatter = (value: string) => { formatterCalls++; return value.toUpperCase() }
const Child = props => {
  childSetups++
  return <button title={props.title} prop:formatter={props.formatter}>child</button>
}
const App = () => <main>
  <section {...{ id: 'base', title: label() }} id="fixed" {...native()} data-once={once(label())}>native</section>
  <Child {...{ title: 'base' }} title={label()} {...child()} formatter={formatter} />
</main>
export const mount = container => render(() => App(), container)
export const updateLabel = setLabel
export const replaceNative = () => setNative({ onClick: secondClick, ref: secondRef })
export const removeChildOverride = () => setChild({})
export const state = () => ({ childSetups, formatterCalls, calls: [...calls], firstRef: firstRef.current, secondRef: secondRef.current, formatter })
`
  const fixture = createFixture(spreadSource)
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
    const section = container.querySelector('section')
    const button = container.querySelector('button')
    assert.equal(section.id, 'fixed')
    assert.equal(section.title, 'override')
    assert.equal(section.getAttribute('data-once'), 'first')
    assert.equal(button.title, 'child override')
    assert.strictEqual(button.formatter, module.state().formatter)
    assert.equal(module.state().formatterCalls, 0)
    section.click()
    module.updateLabel('second')
    module.replaceNative()
    module.removeChildOverride()
    assert.strictEqual(container.querySelector('section'), section)
    assert.strictEqual(container.querySelector('button'), button)
    assert.equal(section.title, 'second')
    assert.equal(button.title, 'second')
    assert.equal(section.getAttribute('data-once'), 'first')
    assert.equal(module.state().firstRef, null)
    assert.strictEqual(module.state().secondRef, section)
    assert.equal(module.state().childSetups, 1)
    assert.equal(module.state().formatterCalls, 0)
    section.click()
    assert.deepEqual(module.state().calls, ['first', 'second'])
    dispose()
    section.click()
    assert.deepEqual(module.state().calls, ['first', 'second'])
    assert.equal(module.state().secondRef, null)
    assert.equal(container.childNodes.length, 0)
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler preserves component spread names, precedence, children and identity', async () => {
  const spreadSource = `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'
const [label, setLabel] = createSignal('first')
const spreadRef = () => {}
const explicitRef = () => {}
const [spread, setSpread] = createSignal({ className: 'spread', title: 'spread', mode: 'spread first', key: 'spread-key', ref: spreadRef, children: 'spread child' })
let childSetups = 0
let receivedRef
const Child = props => {
  childSetups++
  receivedRef = props.ref
  return <section className={props.className} title={props.title} data-mode={props.mode} data-key={props.key}>{props.children}</section>
}
const App = () => <Child {...spread()} className="explicit" title={label()} key="explicit-key" ref={explicitRef}>JSX child</Child>
export const mount = container => render(() => App(), container)
export const update = (nextLabel, nextSpread) => { setLabel(nextLabel); setSpread(nextSpread) }
export const state = () => ({ childSetups, receivedRef, explicitRef, spreadRef })
`
  const fixture = createFixture(spreadSource)
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
    const section = container.querySelector('section')
    assert.ok(section)
    assert.equal(section.className, 'explicit')
    assert.equal(section.title, 'first')
    assert.equal(section.getAttribute('data-mode'), 'spread first')
    assert.equal(section.getAttribute('data-key'), 'explicit-key')
    assert.equal(section.textContent, 'JSX child')
    assert.equal(module.state().childSetups, 1)
    assert.strictEqual(module.state().receivedRef, module.state().explicitRef)

    module.update('second', {
      className: 'later spread',
      title: 'later spread title',
      mode: 'spread second',
      key: 'later spread key',
      ref: module.state().spreadRef,
      children: 'later spread child',
    })

    assert.strictEqual(container.querySelector('section'), section)
    assert.equal(section.className, 'explicit')
    assert.equal(section.title, 'second')
    assert.equal(section.getAttribute('data-mode'), 'spread second')
    assert.equal(section.getAttribute('data-key'), 'explicit-key')
    assert.equal(section.textContent, 'JSX child')
    assert.equal(module.state().childSetups, 1)
    dispose()
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler executes ordered spreads through SSR without DOM globals', async () => {
  const spreadSource = `import { renderToString } from '@zeus-js/runtime-ssr'
let formatterCalls = 0
const formatter = value => { formatterCalls++; return value.toUpperCase() }
const Child = props => <span title={props.title}>{props.formatter('value')}</span>
const App = () => <main>
  <input {...{ disabled: false, title: 'first' }} {...{ 'prop:disabled': true }} disabled={false} title="last" />
  <Child {...{ title: 'base', formatter }} title="final" />
</main>
export const html = () => renderToString(() => App())
export const count = () => formatterCalls
`
  const fixture = createFixture(spreadSource)
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
    assert.equal(
      stripHydrationMarkers(module.html()),
      '<main><input title="last"><span title="final">VALUE</span></main>',
    )
    assert.equal(module.count(), 1)
  } finally {
    await server.close()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler mounts dynamic JSX arrays and delegates branch events', async () => {
  const dynamicSource = `import { createSignal } from '@zeus-js/signal'
import { render } from '@zeus-js/runtime-dom'
const [visible, setVisible] = createSignal(false)
const [items, setItems] = createSignal([])
const calls = []
const renderFunctionChild = () => <button data-region="function" onClick={() => calls.push('function')}>function</button>
const App = () => <main>
  {visible() ? <button data-zeus-node="user" data-region="conditional" onClick={() => calls.push('conditional')}>conditional</button> : null}
  {items().map(item => <button data-region={item} onClick={() => calls.push(item)}>{item}</button>)}
  {[<button data-region="literal" onClick={() => calls.push('literal')}>literal</button>]}
  {renderFunctionChild()}
</main>
export const mount = container => render(() => App(), container)
export const update = (nextVisible, nextItems) => { setVisible(nextVisible); setItems(nextItems) }
export const getCalls = () => [...calls]
`
  const fixture = createFixture(dynamicSource)
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
    document.body.append(container)
    const dispose = module.mount(container)
    const literalButton = container.querySelector('[data-region="literal"]')
    const functionButton = container.querySelector('[data-region="function"]')
    assert.ok(literalButton)
    assert.ok(functionButton)
    literalButton.click()
    functionButton.click()
    assert.deepEqual(module.getCalls(), ['literal', 'function'])

    module.update(true, ['first', 'second'])
    const conditionalButton = container.querySelector(
      '[data-region="conditional"]',
    )
    assert.ok(conditionalButton)
    assert.equal(conditionalButton.getAttribute('data-zeus-node'), 'user')
    conditionalButton.click()
    container.querySelector('[data-region="first"]').click()
    container.querySelector('[data-region="second"]').click()
    assert.deepEqual(module.getCalls(), [
      'literal',
      'function',
      'conditional',
      'first',
      'second',
    ])

    module.update(false, [])
    conditionalButton.click()
    assert.deepEqual(module.getCalls(), [
      'literal',
      'function',
      'conditional',
      'first',
      'second',
    ])
    dispose()
    assert.equal(container.childNodes.length, 0)
    container.remove()
  } finally {
    await server.close()
    restoreDOM()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})

test('native compiler renders conditional, mapped, and array JSX through SSR', async () => {
  const dynamicSource = `import { renderToString } from '@zeus-js/runtime-ssr'
const renderFunctionChild = () => <u>fn</u>
const App = props => <div>
  {props.ok ? <span>yes</span> : <em>no</em>}
  {props.items.map(item => <b>{item}</b>)}
  {[<i>fixed</i>, props.label]}
  {renderFunctionChild()}
</div>
export const html = props => renderToString(() => App(props))
`
  const fixture = createFixture(dynamicSource)
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
    assert.equal(
      stripHydrationMarkers(
        module.html({ ok: true, items: ['a', 'b'], label: 'end' }),
      ),
      '<div><span>yes</span><b>a</b><b>b</b><i>fixed</i>end<u>fn</u></div>',
    )
    assert.equal(
      stripHydrationMarkers(
        module.html({ ok: false, items: [], label: 'tail' }),
      ),
      '<div><em>no</em><i>fixed</i>tail<u>fn</u></div>',
    )
  } finally {
    await server.close()
    rmSync(fixture.root, { force: true, recursive: true })
  }
})
