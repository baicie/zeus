'use strict'

const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs')
const { tmpdir } = require('node:os')
const path = require('node:path')
const test = require('node:test')
const { after } = test

const { transformModule } = require('../index.js')

const fixture = `export const App = (props: { name: string }) => (
  <div class="greeting">Hello {props.name}</div>
)
`

function options(source = fixture) {
  return {
    source,
    filename: 'App.tsx',
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: false,
    sourceMap: true,
  }
}

test('transformModule returns code, source map, and diagnostics', () => {
  const result = transformModule(options())

  assert.deepEqual(result.diagnostics, [])
  assert.match(result.code, /bindText/)
  assert.doesNotMatch(result.code, /=>\s*\(\s*<div/)
  assert.equal(result.map.version, 3)
  assert.deepEqual(result.map.sources, ['App.tsx'])
  assert.deepEqual(result.map.sourcesContent, [fixture])
  assert.equal(result.hydrationPlan.version, 1)
  assert.equal(result.hydrationPlan.components.length, 1)
  assert.ok(
    result.hydrationPlan.components[0].nodes.some(
      node => node.kind === 'text' && node.bindings[0].kind === 'text',
    ),
  )
  assert.ok(
    result.hydrationPlan.components[0].nodes.every(node => !node.optional),
  )
})

test('compiler diagnostics remain structured data', () => {
  const result = transformModule(
    options('export const App = props => <div>{() => props.title}</div>'),
  )

  assert.equal(result.code, '')
  assert.equal(result.map, null)
  assert.equal(result.hydrationPlan, null)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, 'ZEUS_FUNCTION_CHILD')
  assert.equal(result.diagnostics[0].filename, 'App.tsx')
  assert.equal(result.diagnostics[0].severity, 'error')
  assert.equal(typeof result.diagnostics[0].span.start.offset, 'number')
})

test('unsupported JSX attributes are diagnosed instead of silently discarded', () => {
  for (const source of [
    `import { Show } from '@zeus-js/zeus'; export const App = props => <Show when={props.ok} extra={<i />} />`,
    `export const App = props => <div>{props.items.map(item => <b>{item}</b>, <i />)}</div>`,
  ]) {
    const result = transformModule(options(source))

    assert.equal(result.code, '')
    assert.equal(result.diagnostics.length, 1)
    assert.equal(typeof result.diagnostics[0].span.start.offset, 'number')
    assert.equal(typeof result.diagnostics[0].span.end.offset, 'number')
    assert.match(
      result.diagnostics[0].code,
      /^ZEUS_(INVALID_BUILTIN_USAGE|UNSUPPORTED_NESTED_JSX_EXPRESSION)$/,
    )
  }
})

test('once bindings use the runtime flag and invalid targets fail', () => {
  const result = transformModule(
    options(`export const App = props => (
  <div title={once(props.title)}>
    {once(props.label)}
    {props.detail}
  </div>
)`),
  )

  assert.deepEqual(result.diagnostics, [])
  assert.match(result.code, /props\.title\), true\)/)
  assert.match(result.code, /props\.label\), true\)/)
  assert.match(result.code, /props\.detail\)\)/)
  assert.doesNotMatch(result.code, /props\.detail\), true\)/)

  const invalid = transformModule(
    options(
      'export const App = props => <button onClick={once(props.onClick)} />',
    ),
  )

  assert.equal(invalid.code, '')
  assert.equal(invalid.diagnostics.length, 1)
  assert.equal(invalid.diagnostics[0].code, 'ZEUS_INVALID_ONCE_TARGET')

  const legacy = transformModule(
    options('export const App = props => <div>{/* @once */ props.label}</div>'),
  )

  assert.equal(legacy.code, '')
  assert.equal(legacy.diagnostics.length, 1)
  assert.equal(legacy.diagnostics[0].code, 'ZEUS_INVALID_ONCE_TARGET')
  assert.match(legacy.diagnostics[0].message, /no longer accepted/)
  assert.match(legacy.diagnostics[0].hint, /once\(value\)/)
})

test('deeply nested JSX compiles without overflowing the host stack', () => {
  // The Node.js main thread overflowed at roughly 4,000 levels before the
  // transform moved to a dedicated large-stack thread.
  const depth = 5000
  const result = transformModule(
    options(
      `export const App = () => ${'<div>'.repeat(depth)}x${'</div>'.repeat(depth)}\n`,
    ),
  )

  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.code.split('<div').length - 1, depth)
})

test('nesting just under the limit compiles and just over it is diagnosed', () => {
  // JSX is the most stack-hungry construct; 32,700 levels used to pass the
  // preflight and still abort the process.
  const nest = depth =>
    transformModule(
      options(
        `export const App = () => ${'<div>'.repeat(depth)}x${'</div>'.repeat(depth)}\n`,
      ),
    )

  assert.deepEqual(nest(8_000).diagnostics, [])
  assert.deepEqual(
    nest(8_200).diagnostics.map(diagnostic => diagnostic.code),
    ['ZEUS_INPUT_TOO_DEEP'],
  )
})

test('pathological nesting returns a diagnostic instead of aborting the host', () => {
  const depth = 50_000
  const result = transformModule(
    options(`export const value = ${'('.repeat(depth)}1${')'.repeat(depth)}\n`),
  )

  assert.equal(result.code, '')
  assert.equal(result.map, null)
  assert.equal(result.hydrationPlan, null)
  assert.equal(result.diagnostics.length, 1)
  assert.equal(result.diagnostics[0].code, 'ZEUS_INPUT_TOO_DEEP')
  assert.equal(result.diagnostics[0].severity, 'error')
})

// A stack overflow in Oxc aborts the whole process, so each bypass construct
// has to be transformed in a child. A crash shows up as a signal instead of
// ending this test run.
//
// The probe reads its input from the file named on the command line rather
// than stdin: these cases are up to tens of megabytes, and writing that much
// through a `spawnSync` pipe intermittently deadlocks both processes, which
// shows up as a spurious SIGTERM from the timeout.
//
// The file holds one source, or a JSON array of sources so that a group of
// related cases shares a single child instead of paying a native-module load
// each time.
const CRASH_PROBE = `
const fs = require('node:fs')
const { transformModule } = require(${JSON.stringify(path.resolve(__dirname, '../index.js'))})
const input = fs.readFileSync(process.argv[1], 'utf8')
const sources = input.startsWith('[') ? JSON.parse(input) : [input]
try {
  const results = sources.map(source => transformModule({
    source,
    filename: 'probe.tsx',
    target: 'dom',
    runtimeModule: '@zeus-js/runtime-dom',
    delegateEvents: true,
    sourceMap: false,
  }).diagnostics.map(item => item.code))
  process.stdout.write(JSON.stringify(sources.length > 1 ? results : results[0]))
} catch (error) {
  process.stdout.write(JSON.stringify({ error: String(error) }))
}
`

const probeDir = mkdtempSync(path.join(tmpdir(), 'zeus-contract-probe-'))
let probeIndex = 0
after(() => rmSync(probeDir, { force: true, recursive: true }))

function transformInChild(source) {
  const inputPath = path.join(probeDir, `probe-${probeIndex++}.json`)
  writeFileSync(inputPath, source)

  const result = spawnSync(process.execPath, ['-e', CRASH_PROBE, inputPath], {
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 16 * 1024 * 1024,
  })

  if (result.signal) return { crash: result.signal, stderr: result.stderr }
  assert.equal(result.status, 0, result.stderr)

  return { diagnostics: JSON.parse(result.stdout) }
}

/** Transforms every source in one child process; the result lists one entry per source. */
function transformAllInChild(sources) {
  return transformInChild(JSON.stringify(sources))
}

function repeat(unit, times) {
  return unit.repeat(times)
}

test('every construct that aborts the worker stack is rejected in a child process', () => {
  // A leading JSX text apostrophe used to put the rest of the file into a
  // string literal, hiding every construct below from the old depth scan.
  const bypass = "export const P = () => <p>Don't</p>\n"

  // Each count is half of that construct's measured crash depth. The guard has
  // to reject it there, with the other half still to spare.
  const cases = [
    ['parenthesis', 'const v = {}1{}', '(', ')', 800_000],
    ['bracket', 'const v = {}1{}', '[', ']', 800_000],
    ['block', 'function f() {{{}{}', '{', '}', 800_000],
    ['jsx element', 'const A = () => {}x', '<a>', '', 800_000],
    ['fragment', 'const A = () => {}x', '<>', '', 800_000],
    ['template substitution', 'const v = {}1', '`${{', '', 800_000],
    ['object literal', 'const v = {}1', '{{a:', '', 800_000],
    ['call', 'const v = {}1', 'f(', '', 800_000],
    ['jsx attribute expression', 'const A = () => {}1', '<a b={{', '', 800_000],
    ['arrow', 'const f = {}1', '(a) => ', '', 800_000],
    ['ternary', 'const v = {}c', 'a ? b : ', '', 800_000],
    ['assignment', 'const v = {}1', 'a=', '', 800_000],
    ['new', 'const v = {}X', 'new ', '', 800_000],
    ['type arguments', 'type T = {}1{}', 'Array<', '>', 800_000],
    ['member chain', 'const v = a{}', '.a', '', 800_000],
    ['optional chain', 'const v = a{}', '?.a', '', 800_000],
    ['call chain', 'const v = f{}', '()', '', 800_000],
    ['prefix', 'const v = {}a', '!', '', 800_000],
    ['binary', 'const v = {}a', 'a+', '', 800_000],
    ['spread', 'const v = {}[]{}', '[...', ']', 800_000],
    ['else if', 'function f(a) {{{}{}}}', 'if(a){}else ', '', 800_000],
    ['braceless if', 'function f(a) {{{}{}}}', 'if(a)', '', 800_000],
    ['braceless while', 'function f(a) {{{}{}}}', 'while(a)', '', 800_000],
    ['braceless for', 'function f() {{{}{}}}', 'for(;;)', '', 800_000],
    ['label', 'function f(){\n{}\n{}\n}', 'a: ', '', 800_000],
    ['keyof', 'type T = {}X\nexport {}', 'keyof ', '', 800_000],
    ['as assertion', 'const v = (1 as any){}\n', ' as any', '', 800_000],
    ['decorator', '{}\nclass A {{}}', '@d ', '', 8_000_000],
    ['typeof', 'const v = {}a', 'typeof ', '', 4_000_000],
  ]

  for (const [name, template, opener, closer, count] of cases) {
    const source =
      bypass +
      template
        .replace('{}', repeat(opener, count))
        .replace('{}', repeat(closer, count)) +
      '\n'
    const result = transformInChild(source)

    assert.equal(
      result.crash,
      undefined,
      `${name} aborted the child with ${result.crash}`,
    )
    assert.deepEqual(
      result.diagnostics,
      ['ZEUS_INPUT_TOO_DEEP'],
      `${name} was not rejected`,
    )
  }
})

test('the guard accepts realistic flat and sibling-heavy modules in a child process', () => {
  // Every case is far longer than any real module but stays shallow, so the
  // guard must accept it. The sizes keep the whole Oxc transform (not just the
  // preflight) inside the child timeout.
  const cases = [
    // Long sibling sequences never accumulate cost.
    `const list = [${repeat('<li>item</li>,', 2_000)}]\n`,
    repeat('if (flag) { run() }\n', 10_000),
    `f(${repeat('argument,', 50_000)}last)\n`,
    `const config = {${repeat('key: value,', 20_000)}}\n`,
    `export const text = "${repeat('nothing to see ', 20_000)}"\n`,
    `export const sum = ${repeat('a * ', 20_000)}b\n`,
    `type Members = {${repeat('name: string;', 20_000)}}\n`,
    // Comparisons and generic calls must not be mistaken for JSX tags.
    `export const compare = ${repeat('a < b, ', 20_000)}true\n`,
    `export const calls = ${repeat('id<number>(1), ', 20_000)}0\n`,
    // Semicolon-free source ends each statement at a line break. Without that
    // boundary every statement of a flat module accumulates on one spine.
    repeat('const value = 1 + 2 * 3\n', 5_000),
    repeat('const App = props => <button>{props.label}</button>\n', 2_000),
    repeat('function run() { return helper() }\n', 5_000),
    // Realistic component nesting stays well inside the budget.
    `export const App = () => ${repeat('<div>', 400)}x${repeat('</div>', 400)}\n`,
  ]

  for (const source of cases) {
    const result = transformInChild(source)

    assert.equal(
      result.crash,
      undefined,
      `flat input aborted the child with ${result.crash}`,
    )
    assert.doesNotMatch(
      String(result.diagnostics),
      /ZEUS_INPUT_TOO_DEEP/,
      `flat input was rejected: ${source.slice(0, 60)}`,
    )
  }
})

test('deep JSX text apostrophes and generic arrows do not hide later code', () => {
  const cases = [
    `export const P = () => <p>Don't</p>\nconst v = ${repeat('(', 50_000)}1${repeat(')', 50_000)}\n`,
    `const id = <T,>(x: T) => x\nconst v = ${repeat('(', 50_000)}1${repeat(')', 50_000)}\n`,
  ]

  for (const source of cases) {
    const result = transformInChild(source)

    assert.equal(result.crash, undefined)
    assert.deepEqual(result.diagnostics, ['ZEUS_INPUT_TOO_DEEP'])
  }
})

test('a deep construct split across lines is still rejected', () => {
  // A statement may start on a new line, so the preflight resets its cost
  // there. None of these constructs may ride that reset: they are all written
  // one level per line.
  const cases = [
    [800_000, '('],
    [800_000, '<a>'],
    [800_000, 'f('],
    [800_000, '(a) => '],
    [800_000, '.a'],
    [800_000, '()'],
    [800_000, 'a+'],
    [800_000, 'new '],
    [800_000, 'if(a)'],
    [84_000, 'while(a)'],
    [57_000, 'for(;;)'],
  ]

  for (const [depth, opener] of cases) {
    const body = Array.from({ length: depth }, () => opener).join('\n')
    const result = transformAllInChild([
      `const v = ${body}\n`,
      `function f(a) {\n${body}\n}\n`,
      `type T = ${body}1\n`,
    ])

    assert.equal(
      result.crash,
      undefined,
      `the child aborted on ${opener.trim()} per line`,
    )
    assert.deepEqual(
      result.diagnostics,
      Array.from({ length: 3 }, () => ['ZEUS_INPUT_TOO_DEEP']),
      `not rejected: ${opener.trim()} per line`,
    )
  }
})

test('invalid ABI options throw instead of becoming compiler diagnostics', () => {
  assert.throws(
    () => transformModule({ ...options(), target: 'wasm' }),
    /target must be "dom" or "ssr"/,
  )
})

test('generated declarations preserve the transform contract', () => {
  const declarations = readFileSync(
    path.resolve(__dirname, '../index.d.ts'),
    'utf8',
  )

  assert.match(declarations, /target: 'dom' \| 'ssr'/)
  assert.match(declarations, /severity: 'error' \| 'warning'/)
  assert.match(declarations, /sourcesContent: Array<string \| null>/)
  assert.match(declarations, /map: RawSourceMap \| null/)
  assert.match(declarations, /hydrationPlan: HydrationPlan \| null/)
})
