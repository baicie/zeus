import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { NodeTypes } from '../src/ast'

describe('compiler: parse', () => {
  it('should parse simple jsx element', () => {
    const ast = parse('<div>hello</div>')

    expect(ast).toMatchObject({
      type: NodeTypes.ROOT,
      children: [
        {
          type: NodeTypes.ELEMENT,
          tag: 'div',
          props: [],
          children: [
            {
              type: NodeTypes.TEXT,
              content: 'hello',
            },
          ],
        },
      ],
    })
  })

  it('should parse jsx with attributes', () => {
    const ast = parse('<button class="btn" onClick={handler}>Click</button>')

    expect(ast).toMatchObject({
      type: NodeTypes.ROOT,
      children: [
        {
          type: NodeTypes.ELEMENT,
          tag: 'button',
          props: [
            {
              type: NodeTypes.ATTRIBUTE,
              name: 'class',
              value: {
                type: NodeTypes.TEXT,
                content: 'btn',
              },
            },
            {
              type: NodeTypes.DIRECTIVE,
              name: 'onClick',
              exp: {
                type: NodeTypes.SIMPLE_EXPRESSION,
                content: 'handler',
              },
            },
          ],
        },
      ],
    })
  })
})
