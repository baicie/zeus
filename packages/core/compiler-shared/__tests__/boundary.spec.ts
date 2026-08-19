import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  attrBindingIR,
  dynamicTextIR,
  eventBindingIR,
  expressionIR,
  hostIR,
  propBindingIR,
  ref,
  refBindingIR,
  slotIR,
  staticAttrIR,
} from '../src'

import type { AttributeIR } from '../src'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const fixtureSpan = {
  start: { line: 1, column: 0, offset: 0 },
  end: { line: 1, column: 1, offset: 1 },
}

describe('compiler-shared boundary', () => {
  it('round-trips IR through JSON without compiler frontend objects', () => {
    const node = dynamicTextIR(
      expressionIR('props.title', {
        start: { line: 1, column: 7, offset: 7 },
        end: { line: 1, column: 18, offset: 18 },
      }),
      ref('text$'),
    )

    expect(JSON.parse(JSON.stringify(node))).toEqual(node)
  })

  it('round-trips precise For accessor dependencies on expressions', () => {
    const expression = expressionIR('item.label', fixtureSpan, 'member', [
      { forId: 7, item: true, index: false },
    ])

    expect(JSON.parse(JSON.stringify(expression))).toEqual(expression)
    expect(expression.forAccessors).toEqual([
      { forId: 7, item: true, index: false },
    ])
  })

  it('keeps explicit once mode on text, attribute, and property bindings', () => {
    const text = dynamicTextIR(
      expressionIR('props.title', fixtureSpan, 'member'),
      ref('text$'),
      true,
    )
    const attribute = attrBindingIR(
      'title',
      expressionIR('props.title', fixtureSpan, 'member'),
      fixtureSpan,
      true,
    )
    const property = propBindingIR(
      'value',
      expressionIR('props.value', fixtureSpan, 'member'),
      fixtureSpan,
      true,
    )

    expect(text.once).toBe(true)
    expect(attribute.once).toBe(true)
    expect(property.once).toBe(true)
    expect(JSON.parse(JSON.stringify([text, attribute, property]))).toEqual([
      text,
      attribute,
      property,
    ])
  })

  it('preserves Host and Slot source spans through semantic builders', () => {
    const hostSpan = {
      start: { line: 2, column: 4, offset: 12 },
      end: { line: 6, column: 11, offset: 96 },
    }
    const slotSpan = {
      start: { line: 4, column: 6, offset: 48 },
      end: { line: 4, column: 14, offset: 56 },
    }
    const node = hostIR({
      attrs: [],
      span: hostSpan,
      child: slotIR({ ref: ref('slot$'), span: slotSpan }),
    })

    expect(JSON.parse(JSON.stringify(node))).toEqual(node)
    expect(node.span).toEqual(hostSpan)
    expect(node.child?.span).toEqual(slotSpan)
  })

  it('shares the canonical attribute binding JSON schema with Rust', () => {
    const fixture = JSON.parse(
      readFileSync(
        join(packageRoot, 'fixtures/attribute-bindings.json'),
        'utf8',
      ),
    ) as AttributeIR[]
    const built: AttributeIR[] = [
      staticAttrIR('class', 'field', fixtureSpan),
      staticAttrIR('disabled', true, fixtureSpan),
      attrBindingIR(
        'title',
        expressionIR('props.title', fixtureSpan, 'member'),
        fixtureSpan,
      ),
      propBindingIR(
        'value',
        expressionIR('() => props.value', fixtureSpan, 'getter'),
        fixtureSpan,
      ),
      eventBindingIR(
        'click',
        expressionIR("props.handlers['click']", fixtureSpan, 'member'),
        fixtureSpan,
      ),
      refBindingIR(expressionIR('inputRef', fixtureSpan), fixtureSpan),
    ]
    const normalized = built.map((attribute, index) => ({
      ...attribute,
      id: index + 3,
    }))

    expect(normalized).toEqual(fixture)
    expect(JSON.parse(JSON.stringify(normalized))).toEqual(fixture)
  })

  it('declares no Babel package dependencies', () => {
    const packageJson = JSON.parse(
      readFileSync(join(packageRoot, 'package.json'), 'utf8'),
    ) as Record<string, Record<string, string> | undefined>
    const dependencyNames = [
      ...Object.keys(packageJson.dependencies ?? {}),
      ...Object.keys(packageJson.devDependencies ?? {}),
      ...Object.keys(packageJson.peerDependencies ?? {}),
    ]

    expect(dependencyNames.filter(name => name.startsWith('@babel/'))).toEqual(
      [],
    )
  })

  it('keeps Babel imports out of compiler-shared source', () => {
    const sourceFiles = collectFiles(join(packageRoot, 'src'))
    const babelImports = sourceFiles.flatMap(file => {
      const source = readFileSync(file, 'utf8')
      return source.includes('@babel/') ? [file] : []
    })

    expect(babelImports).toEqual([])
  })
})

function collectFiles(directory: string): string[] {
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? collectFiles(path) : [path]
  })
}
