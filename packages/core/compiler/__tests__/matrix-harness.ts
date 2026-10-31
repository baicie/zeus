import { JSDOM } from 'jsdom'
import { expect, vi } from 'vitest'

import {
  transformModule,
  type HydrationPlan,
  type TransformModuleOptions,
  type TransformModuleResult,
} from '../src'

/**
 * Shared helpers for the compiler semantic matrix
 * (`docs/internal/compiler-semantic-matrix.md`). Every fixture is compiled by
 * the Rust native binary through the public `@zeus-js/compiler` contract and,
 * where the matrix asks for runtime evidence, executed against the real DOM or
 * SSR runtime. Generated IR is internal and intentionally never asserted here.
 */

export type Target = 'dom' | 'ssr'

export const FILENAME = 'input.tsx'

export function compile(
  source: string,
  target: Target,
  overrides: Partial<TransformModuleOptions> = {},
): TransformModuleResult {
  return transformModule({
    source,
    filename: FILENAME,
    target,
    runtimeModule:
      target === 'ssr' ? '@zeus-js/runtime-ssr' : '@zeus-js/runtime-dom',
    delegateEvents: target === 'dom',
    sourceMap: true,
    ...overrides,
  })
}

/** Compiles without diagnostics and checks that no JSX survives codegen. */
export function compileOk(
  source: string,
  target: Target,
  overrides: Partial<TransformModuleOptions> = {},
): TransformModuleResult {
  const result = compile(source, target, overrides)
  expect(result.diagnostics).toEqual([])
  // Template HTML lives in string literals; raw JSX would follow an arrow,
  // `return`, an opening parenthesis or a comma directly.
  expect(result.code).not.toMatch(/(?:=>|return|\(|,)\s*<[A-Za-z]/)
  return result
}

const REGISTRY = '__ZEUS_COMPILER_MATRIX__'
let moduleNonce = 0

type Registry = Record<string, Record<string, Record<string, unknown>>>

/**
 * Imports generated code as an ES module. Each `@zeus-js/*` import is served
 * by a data-URL proxy over the namespace registered for `realm`, so the
 * generated module runs against the same runtime instance as the test.
 */
export async function loadModule<T>(
  code: string,
  realm: string,
  modules: Record<string, Record<string, unknown>>,
): Promise<T> {
  const globalState = globalThis as typeof globalThis & {
    [REGISTRY]?: Registry
  }
  const registry = (globalState[REGISTRY] ??= {})
  registry[realm] = modules
  const executable = code.replace(
    /from\s*(['"])(@zeus-js\/[\w/-]+)\1/g,
    (_match, _quote: string, specifier: string) => {
      const namespace = modules[specifier]
      if (!namespace) {
        throw new Error(`No runtime registered for ${specifier} in ${realm}`)
      }
      const proxy = Object.keys(namespace)
        .filter(name => name !== 'default' && /^[A-Za-z_$][\w$]*$/.test(name))
        .map(
          name =>
            `export const ${name} = globalThis.${REGISTRY}[${JSON.stringify(
              realm,
            )}][${JSON.stringify(specifier)}][${JSON.stringify(name)}];`,
        )
        .join('\n')
      return `from ${JSON.stringify(toDataURL(proxy))}`
    },
  )
  return (await import(
    /* @vite-ignore */ toDataURL(`${executable}\n// matrix:${moduleNonce++}`)
  )) as T
}

export function toDataURL(code: string): string {
  return `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
}

const DOM_GLOBALS = [
  'document',
  'Node',
  'Element',
  'HTMLElement',
  'SVGElement',
  'HTMLSlotElement',
  'ShadowRoot',
  'Text',
  'Comment',
  'DocumentFragment',
  'NodeFilter',
  'Event',
  'CustomEvent',
  'MouseEvent',
  'FocusEvent',
  'MutationObserver',
  'customElements',
] as const

/**
 * Installs a JSDOM window as the DOM runtime globals. Passing the same JSDOM
 * again restores it after `removeDOMGlobals()`, so delegated listeners that
 * runtime-dom registered on that document stay valid.
 */
export function installJSDOM(
  dom = new JSDOM('<!doctype html><html><body></body></html>'),
): JSDOM {
  const window = dom.window as unknown as Record<string, unknown>
  vi.stubGlobal('window', dom.window)
  for (const name of DOM_GLOBALS) vi.stubGlobal(name, window[name])
  return dom
}

/**
 * Removes every DOM global so SSR output is proven to execute without
 * `window`/`document`, matching a plain Node server process.
 */
export function removeDOMGlobals(): void {
  for (const name of [...DOM_GLOBALS, 'window', 'navigator'] as const) {
    vi.stubGlobal(name, undefined)
  }
}

const MARKER = /<!--zeus:hydrate:([^>]+?)-->/g

export function stripHydrationMarkers(html: string): string {
  return html.replace(MARKER, '')
}

/** Hydration marker IDs written by SSR codegen. */
export function ssrCodeMarkerIds(code: string): string[] {
  return [...code.matchAll(/\$zeusHydrationMarker\("([^"]+)"\)/g)].map(
    match => match[1],
  )
}

/** Hydration marker IDs present in rendered server HTML. */
export function htmlMarkerIds(html: string): string[] {
  return [...html.matchAll(MARKER)].map(match => match[1])
}

export function planNodeIds(plan: HydrationPlan | null): string[] {
  return (plan?.components ?? []).flatMap(component =>
    component.nodes.map(node => node.id),
  )
}

const SVG_NS = 'http://www.w3.org/2000/svg'

/**
 * Order-insensitive structural serialization used for DOM/SSR parity.
 * Comments (region anchors and hydration markers) are dropped, adjacent text
 * is merged because DOM bindings create separate text nodes where server HTML
 * has one, attributes are sorted, and `style` is normalized through CSSOM.
 */
export function canonicalHTML(nodes: ArrayLike<Node>): string {
  let output = ''
  let text = ''
  const flush = () => {
    if (text) output += escapeText(text)
    text = ''
  }
  for (const node of Array.from(nodes)) {
    if (node.nodeType === 3) {
      text += (node as Text).data
      continue
    }
    if (node.nodeType === 8) continue
    flush()
    if (node.nodeType === 11) {
      output += canonicalHTML(node.childNodes)
      continue
    }
    const element = node as Element
    const prefix = element.namespaceURI === SVG_NS ? 'svg:' : ''
    const attributes = Array.from(element.attributes)
      .map(attribute => {
        const value =
          attribute.name === 'style'
            ? (element as HTMLElement).style.cssText
            : attribute.value
        return `${attribute.name}="${value}"`
      })
      .sort()
    output += `<${prefix}${element.localName}${attributes
      .map(attribute => ` ${attribute}`)
      .join(
        '',
      )}>${canonicalHTML(element.childNodes)}</${prefix}${element.localName}>`
  }
  flush()
  return output
}

function escapeText(value: string): string {
  return value.replace(/[&<>]/g, character => `&#${character.charCodeAt(0)};`)
}

export interface SourcePoint {
  line: number
  column: number
  offset: number
}

/**
 * Position of `index` (UTF-16) in `source`, using the compiler span contract:
 * 1-based line, 0-based UTF-16 column, UTF-8 byte offset.
 */
export function pointAt(source: string, index: number): SourcePoint {
  const before = source.slice(0, index)
  const lineStart = before.lastIndexOf('\n') + 1
  return {
    line: before.split('\n').length,
    column: index - lineStart,
    offset: Buffer.byteLength(before),
  }
}

/** Source-map style position (1-based line, 0-based column) in `code`. */
export function generatedPosition(
  code: string,
  index: number,
): { line: number; column: number } {
  const { line, column } = pointAt(code, index)
  return { line, column }
}
