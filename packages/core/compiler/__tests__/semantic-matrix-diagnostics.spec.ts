import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { compile, FILENAME, pointAt, type Target } from './matrix-harness'

const repositoryRoot = join(__dirname, '../../../..')

// A CRLF line with astral and CJK characters before every fixture proves that
// diagnostic offsets are UTF-8 bytes while lines count `\n` across CRLF input.
const PREFIX = '// \u{1f600}中 matrix fixture\r\n'
const BUILTINS =
  "import { Show, For, ErrorBoundary, Transition, defineElement, Host, Slot } from '@zeus-js/zeus'\r\n"

interface DiagnosticCase {
  code: string
  source: string
  /** Exact source text covered by the diagnostic span. */
  text: string
  /** Search anchor when `text` is not unique; the span starts inside it. */
  anchor?: string
  /** The span is an empty range at the end of the input. */
  atEnd?: boolean
  targets?: readonly Target[]
  filename?: string
  /** Diagnostics without a source position (for example source type). */
  noSpan?: boolean
}

const cases: DiagnosticCase[] = [
  {
    code: 'ZEUS_ASYNC_COMPONENT',
    source: 'export const App = async props => <div>{props.a}</div>',
    text: 'async props => ',
  },
  {
    code: 'ZEUS_EMPTY_EXPRESSION',
    source: 'export const App = () => <div ref />',
    text: 'ref',
  },
  {
    code: 'ZEUS_FUNCTION_ATTRIBUTE',
    source: 'export const App = props => <div title={() => props.t} />',
    text: '{() => props.t}',
  },
  {
    code: 'ZEUS_FUNCTION_BUILTIN_VALUE',
    source:
      BUILTINS +
      'export const App = props => <Show when={() => props.ok}><b /></Show>',
    text: '{() => props.ok}',
  },
  {
    code: 'ZEUS_FUNCTION_CHILD',
    // The emoji before the span on the same line checks UTF-16 columns.
    source: 'export const App = props => <div>\u{1f600}{() => props.t}</div>',
    text: '{() => props.t}',
  },
  {
    code: 'ZEUS_INVALID_BUILTIN_USAGE',
    source:
      BUILTINS +
      'export const App = props => <Show when={props.ok} extra="x"><b /></Show>',
    text: 'extra="x"',
  },
  {
    code: 'ZEUS_INVALID_EVENT_BINDING',
    source: 'export const App = props => <div on-change={props.change} />',
    text: 'on-change',
  },
  {
    code: 'ZEUS_INVALID_ERROR_BOUNDARY_FALLBACK',
    source:
      BUILTINS +
      'export const App = () => <ErrorBoundary fallback={<i>x</i>}><b /></ErrorBoundary>',
    text: '<i>x</i>',
  },
  {
    code: 'ZEUS_INVALID_FOR_CHILD',
    source:
      BUILTINS +
      'export const App = props => <For each={props.items}><li /></For>',
    text: '<For each={props.items}><li /></For>',
  },
  {
    code: 'ZEUS_INVALID_HOST_USAGE',
    source: BUILTINS + 'export const App = () => <Host />',
    text: '<Host />',
  },
  {
    code: 'ZEUS_INVALID_ONCE_INTRINSIC',
    source:
      'export const App = props => <div title={once(props.a, props.b)} />',
    text: '{once(props.a, props.b)}',
  },
  {
    code: 'ZEUS_INVALID_ONCE_TARGET',
    source:
      'export const App = props => <button onClick={once(props.onClick)} />',
    text: '{once(props.onClick)}',
  },
  {
    code: 'ZEUS_INVALID_PROPERTY_BINDING',
    source: 'export const App = () => <input prop:value="x" />',
    text: 'prop:value="x"',
  },
  {
    code: 'ZEUS_INVALID_PROP_NAME',
    source:
      'export const App = props => <z-grid prop:selection-mode={props.mode} />',
    text: 'prop:selection-mode',
  },
  {
    code: 'ZEUS_INVALID_REF_USAGE',
    source: 'export const App = () => <div ref="target" />',
    text: 'ref="target"',
  },
  {
    code: 'ZEUS_INVALID_SHOW_FALLBACK',
    source:
      BUILTINS +
      'const render = v => v\r\nexport const App = props => <Show when={props.ok} fallback={render(<i />)}><b /></Show>',
    text: '{render(<i />)}',
  },
  {
    code: 'ZEUS_INVALID_SLOT_NAME',
    source:
      BUILTINS +
      "export const El = defineElement('z-x', {}, props => <Host><Slot name={props.n} /></Host>)",
    text: 'name={props.n}',
  },
  {
    code: 'ZEUS_INVALID_SLOT_USAGE',
    source: BUILTINS + 'export const App = () => <div><Slot /></div>',
    text: '<Slot />',
  },
  {
    code: 'ZEUS_MIXED_RAW_TEXT_BINDING_MODE',
    source:
      'export const App = props => <style>{once(props.a)}{props.b}</style>',
    text: '<style>{once(props.a)}{props.b}</style>',
  },
  {
    code: 'ZEUS_PARSE_ERROR',
    source: 'export const App = () => <div>',
    text: '',
    atEnd: true,
  },
  {
    code: 'ZEUS_SEMANTIC_ERROR',
    source: 'let a = 1\r\nlet a = 2\r\nexport const App = () => <div />',
    anchor: 'let a = 1',
    text: 'a',
  },
  {
    code: 'ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED',
    source:
      BUILTINS +
      'export const App = () => <ErrorBoundary fallback={error => <i>x</i>}><b /></ErrorBoundary>',
    text: '<ErrorBoundary fallback={error => <i>x</i>}><b /></ErrorBoundary>',
    targets: ['ssr'],
  },
  {
    code: 'ZEUS_UNSUPPORTED_ARRAY_MAP_CALLBACK_PARAMETER',
    source:
      'export const App = props => <ul>{props.items.map((item, index, all) => <li>{all.length}</li>)}</ul>',
    anchor: 'all)',
    text: 'all',
  },
  {
    code: 'ZEUS_UNSUPPORTED_ARRAY_SPREAD',
    source: 'export const App = props => <ul>{[...props.items, <li />]}</ul>',
    text: '...props.items',
  },
  {
    code: 'ZEUS_UNSAFE_HTML_PROPERTY',
    source: 'export const App = props => <div prop:innerHTML={props.html} />',
    text: 'prop:innerHTML',
  },
  {
    code: 'ZEUS_UNSUPPORTED_ASYNC_EXPRESSION',
    source:
      'export async function load(props) {\r\n  return <p>{await props.a}</p>\r\n}',
    text: 'await props.a',
  },
  {
    code: 'ZEUS_UNSUPPORTED_BUILTIN_SPREAD',
    source:
      BUILTINS +
      'export const App = props => <Show {...props} when={props.ok}><b /></Show>',
    text: '{...props}',
  },
  {
    code: 'ZEUS_UNSUPPORTED_COMPONENT_NAME',
    source: 'export const App = () => <a:B />',
    text: 'a:B',
  },
  {
    code: 'ZEUS_UNSUPPORTED_COMPONENT_PROP_NAMESPACE',
    source:
      'const Child = props => <span />\r\nexport const App = () => <Child prop:value={1} />',
    text: 'prop:value={1}',
  },
  {
    code: 'ZEUS_UNSUPPORTED_DOCUMENT_ELEMENT',
    source: 'export const App = () => <body />',
    anchor: '<body',
    text: 'body',
  },
  {
    code: 'ZEUS_UNSUPPORTED_FOR_CALLBACK_PARAMETER',
    source:
      BUILTINS +
      'export const App = props => <For each={props.items}>{({ id }) => <li>{id}</li>}</For>',
    text: '{ id }',
  },
  {
    code: 'ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE',
    source:
      BUILTINS +
      'export const App = props => <Transition when={props.open} enter={<i />} />',
    text: '{<i />}',
  },
  {
    code: 'ZEUS_UNSUPPORTED_NAMESPACED_ATTRIBUTE',
    source: 'export const App = props => <div xml:lang={props.l} />',
    text: 'xml:lang',
  },
  {
    code: 'ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION',
    source:
      'const render = v => v\r\nexport const App = () => <div>{render(<i />)}</div>',
    text: '{render(<i />)}',
  },
  {
    code: 'ZEUS_UNSUPPORTED_RAW_TEXT_CHILD',
    source: 'export const App = props => <script><b>{props.a}</b></script>',
    text: '<script><b>{props.a}</b></script>',
  },
  {
    code: 'ZEUS_UNSUPPORTED_RAW_TEXT_ELEMENT',
    source: 'export const App = () => <noscript />',
    anchor: '<noscript',
    text: 'noscript',
  },
  {
    code: 'ZEUS_UNSUPPORTED_SOURCE_TYPE',
    source: 'export const App = () => <div />',
    text: '',
    filename: 'input.vue',
    noSpan: true,
  },
  {
    code: 'ZEUS_UNSUPPORTED_SPREAD_CHILD',
    source: 'export const App = props => <div>{...props.items}</div>',
    text: '{...props.items}',
  },
  {
    code: 'ZEUS_UNSUPPORTED_SSR_PROPERTY',
    source: 'export const App = props => <div prop:textContent={props.t} />',
    text: 'prop:textContent={props.t}',
    targets: ['ssr'],
  },
  {
    code: 'ZEUS_UNSUPPORTED_TEMPLATE_ELEMENT',
    source: 'export const App = () => <template />',
    anchor: '<template',
    text: 'template',
  },
  {
    code: 'ZEUS_UNSUPPORTED_VOID_ELEMENT_CHILDREN',
    source: 'export const App = () => <input>x</input>',
    text: '<input>x</input>',
  },
]

function rustDiagnosticCodes(): string[] {
  const directory = join(repositoryRoot, 'crates/zeus_compiler/src')
  const codes = new Set<string>()
  for (const file of readdirSync(directory)) {
    if (!file.endsWith('.rs')) continue
    const content = readFileSync(join(directory, file), 'utf8')
    for (const match of content.matchAll(/"(ZEUS_[A-Z0-9_]+)"/g)) {
      codes.add(match[1])
    }
  }
  return [...codes].sort()
}

describe('compiler semantic matrix: diagnostics', () => {
  it('covers every diagnostic code defined by the Rust compiler', () => {
    const covered = cases.map(entry => entry.code)
    expect([...new Set(covered)].sort()).toEqual(rustDiagnosticCodes())
  })

  it('documents every Rust diagnostic code in the semantic matrix', () => {
    const matrix = readFileSync(
      join(repositoryRoot, 'docs/internal/compiler-semantic-matrix.md'),
      'utf8',
    )
    for (const code of rustDiagnosticCodes()) {
      expect(matrix, code).toContain(`\`${code}\``)
    }
  })

  for (const entry of cases) {
    it(`reports ${entry.code} with file, line, column and offset`, () => {
      const source = PREFIX + entry.source
      const filename = entry.filename ?? FILENAME
      const results = (['dom', 'ssr'] as const).map(target =>
        compile(source, target, { filename }),
      )

      for (const [index, target] of (['dom', 'ssr'] as const).entries()) {
        const result = results[index]
        if (entry.targets && !entry.targets.includes(target)) {
          expect(result.diagnostics).toEqual([])
          continue
        }
        expect(result.code).toBe('')
        expect(result.map).toBeNull()
        expect(result.hydrationPlan).toBeNull()
        expect(result.diagnostics).toHaveLength(1)

        const [diagnostic] = result.diagnostics
        expect(diagnostic.code).toBe(entry.code)
        expect(diagnostic.severity).toBe('error')
        expect(diagnostic.filename).toBe(filename)
        expect(diagnostic.message.length).toBeGreaterThan(0)
        if (diagnostic.hint !== undefined) {
          expect(diagnostic.hint.length).toBeGreaterThan(0)
        }

        if (entry.noSpan) {
          expect(diagnostic.span ?? null).toBeNull()
          continue
        }
        const start = entry.atEnd
          ? source.length
          : source.indexOf(entry.anchor ?? entry.text) +
            (entry.anchor ? entry.anchor.indexOf(entry.text) : 0)
        expect(start).toBeGreaterThan(PREFIX.length - 1)
        expect(diagnostic.span).toEqual({
          start: pointAt(source, start),
          end: pointAt(source, start + entry.text.length),
        })
      }

      if (!entry.targets) {
        expect(results[1].diagnostics).toEqual(results[0].diagnostics)
      }
    })
  }

  it('gives each diagnostic code its own actionable hint', () => {
    const hints = new Map<string, string>()
    for (const entry of cases) {
      const target = entry.targets?.[0] ?? 'dom'
      const [diagnostic] = compile(PREFIX + entry.source, target, {
        filename: entry.filename ?? FILENAME,
      }).diagnostics
      if (diagnostic.hint !== undefined) hints.set(entry.code, diagnostic.hint)
    }

    const codesByHint = new Map<string, string[]>()
    for (const [code, hint] of hints) {
      codesByHint.set(hint, [...(codesByHint.get(hint) ?? []), code])
    }
    const shared = [...codesByHint.values()].filter(codes => codes.length > 1)
    expect(shared).toEqual([])
  })

  it('returns structured diagnostics for malformed input without throwing', () => {
    const inputs: Array<[string, string]> = [
      ['input.tsx', '\u0000'],
      ['input.tsx', 'export const App = () => <div><span></div>'],
      ['input.ts', 'export const App = () => <div />'],
      ['input.tsx', 'export const App = () => <div>{</div>'],
    ]
    for (const [filename, source] of inputs) {
      for (const target of ['dom', 'ssr'] as const) {
        const result = compile(source, target, { filename })
        expect(result.code).toBe('')
        expect(result.diagnostics.length).toBeGreaterThan(0)
        expect(result.diagnostics[0].code).toBe('ZEUS_PARSE_ERROR')
        expect(result.diagnostics[0].span?.start.line).toBe(1)
      }
    }
  })

  it('compiles inputs without JSX unchanged and without diagnostics', () => {
    for (const source of ['', 'export const value: number = 1\r\n']) {
      for (const target of ['dom', 'ssr'] as const) {
        const result = compile(source, target)
        expect(result.diagnostics).toEqual([])
        expect(result.code).toBe(source)
        expect(result.hydrationPlan).toBeNull()
      }
    }
  })

  it('compiles 1000 nested elements without crashing the host process', () => {
    const depth = 1000
    const source = `export const App = () => ${'<b>'.repeat(depth)}x${'</b>'.repeat(depth)}`
    for (const target of ['dom', 'ssr'] as const) {
      const result = compile(source, target)
      expect(result.diagnostics).toEqual([])
      expect(result.code.length).toBeGreaterThan(depth)
    }
  })
})
