import { parseExpression } from '@babel/parser'
import { expressionIR } from '@zeus-js/compiler-shared'
import { describe, expect, it } from 'vitest'

import {
  parseExpressionIR,
  sourceSpanFromBabelNode,
} from '../src/adapters/babel/expression'

describe('Babel expression IR adapter', () => {
  it('parses TypeScript and JSX expressions at the codegen boundary', () => {
    expect(
      parseExpressionIR(expressionIR('value satisfies Record<string, unknown>'))
        .type,
    ).toBe('TSSatisfiesExpression')
    expect(parseExpressionIR(expressionIR('<span>{value}</span>')).type).toBe(
      'JSXElement',
    )
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
})
