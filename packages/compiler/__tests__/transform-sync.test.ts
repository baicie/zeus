import { describe, expect, it } from 'vitest'
import { transformSync } from '../src/api'

describe('@zeus-js/compiler transformSync', () => {
  it('compiles a static div with text', () => {
    const { code } = transformSync({
      code: 'export function F() { return <div class="a">hi</div>; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('template')
    expect(code.indexOf('hi') >= 0 && code.indexOf('div') >= 0).toBe(true)
    expect(code).toContain('zeus')
  })

  it('compiles delegated onClick', () => {
    const { code } = transformSync({
      code: 'const h = () => {};\nexport function F() { return <button onClick={h}>x</button>; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('$$click')
    expect(code).toContain('delegateEvents')
  })

  it('compiles createComponent for capitalized tag', () => {
    const { code } = transformSync({
      code: 'export function F() { return <Foo bar={1} />; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('createComponent')
  })
})
