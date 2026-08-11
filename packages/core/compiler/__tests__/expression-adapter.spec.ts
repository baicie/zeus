import { parseExpression } from '@babel/parser'
import { expressionIR } from '@zeus-js/compiler-shared'
import { describe, expect, it } from 'vitest'

import {
  expressionFormFromBabelNode,
  expressionIRFromCode,
  parseExpressionIR,
  sourceSpanFromBabelNode,
} from '../src/adapters/babel/expression'

const fixtureSpan = {
  start: { line: 1, column: 0, offset: 0 },
  end: { line: 1, column: 1, offset: 1 },
}

describe('Babel expression IR adapter', () => {
  it('parses TypeScript and JSX expressions at the codegen boundary', () => {
    expect(
      parseExpressionIR(
        expressionIR('value satisfies Record<string, unknown>', fixtureSpan),
      ).type,
    ).toBe('TSSatisfiesExpression')
    expect(
      parseExpressionIR(expressionIR('<span>{value}</span>', fixtureSpan)).type,
    ).toBe('JSXElement')
  })

  it('converts Babel locations to serializable source spans', () => {
    const node = parseExpression('props.title', {
      sourceType: 'module',
      startLine: 4,
      startColumn: 6,
      startIndex: 50,
    })

    expect(sourceSpanFromBabelNode(node)).toEqual({
      start: { line: 4, column: 6, offset: 50 },
      end: { line: 4, column: 17, offset: 61 },
    })
  })

  it('restores source spans when parsing expression IR', () => {
    const expression = parseExpressionIR(
      expressionIR('props.title', {
        start: { line: 7, column: 12, offset: 80 },
        end: { line: 7, column: 23, offset: 91 },
      }),
    )

    expect(sourceSpanFromBabelNode(expression)).toEqual({
      start: { line: 7, column: 12, offset: 80 },
      end: { line: 7, column: 23, offset: 91 },
    })
  })

  it('classifies synthesized expression shape from code instead of its source node', () => {
    const sourceNode = parseExpression('value')

    expect(expressionIRFromCode('UI.Button', sourceNode).form).toBe('member')
  })

  it.each([
    ['value', 'value'],
    ['() => value', 'getter'],
    ['function () { return value }', 'getter'],
    ['props.value', 'member'],
    ["props.handlers['click']", 'member'],
    ['props.handlers?.click', 'member'],
    ['(props.value as string)', 'member'],
  ] as const)('classifies %s as %s', (source, expected) => {
    expect(
      expressionFormFromBabelNode(
        parseExpression(source, { plugins: ['typescript'] }),
      ),
    ).toBe(expected)
  })
})
