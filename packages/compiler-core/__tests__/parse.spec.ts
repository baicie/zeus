import { describe, expect, it } from 'vitest'
import { parse } from '../src/parse'
import { NodeTypes } from '../src/ast'

describe('compiler: parse', () => {
  it('should parse simple element', () => {
    const ast = parse('<div>hello</div>')

    expect(ast).toMatchObject({
      type: NodeTypes.ROOT,
      children: [
        {
          type: NodeTypes.ELEMENT,
          tag: 'div',
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

  it('should parse attributes', () => {
    const ast = parse('<div id="app" class="container"></div>')

    expect(ast.children[0].props).toMatchObject([
      {
        type: NodeTypes.ATTRIBUTE,
        name: 'id',
        value: {
          type: NodeTypes.TEXT,
          content: 'app',
        },
      },
      {
        type: NodeTypes.ATTRIBUTE,
        name: 'class',
        value: {
          type: NodeTypes.TEXT,
          content: 'container',
        },
      },
    ])
  })

  it('should parse events', () => {
    const ast = parse('<button onClick={handler}>Click</button>')

    expect(ast.children[0].props).toMatchObject([
      {
        type: NodeTypes.DIRECTIVE,
        name: 'onClick',
        exp: {
          type: NodeTypes.SIMPLE_EXPRESSION,
          content: 'handler',
        },
      },
    ])
  })
})
