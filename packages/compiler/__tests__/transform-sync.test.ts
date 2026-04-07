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

  it('compiles dom spread/ref/use directive', () => {
    const { code } = transformSync({
      code: 'const p = { id: "a" }; const r = () => {}; const u = (el: any) => el;\nexport function F() { return <div {...p} ref={r} use:x={u}>x</div>; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('spread')
    expect(code).toContain('ref')
    expect(code).toContain('use')
  })

  it('compiles component spread props', () => {
    const { code } = transformSync({
      code: 'const p = { a: 1 };\nexport function F() { return <Foo b={2} {...p} />; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('Object.assign')
    expect(code).toContain('createComponent')
  })

  it('compiles non-empty fragment with text and expression', () => {
    const { code } = transformSync({
      code: 'export function F() { const x = 1; return <>a{x}</>; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('createComponent')
    expect(code).toContain('Fragment')
    expect(code).toContain('children')
  })

  it('compiles fragment with nested jsx children', () => {
    const { code } = transformSync({
      code: 'export function F() { return <><div id="a" /><Foo bar={1} /></>; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('createComponent')
    expect(code).toContain('template')
    expect(code).toContain('children')
  })

  it('compiles use directive tuple args and style dynamic helper', () => {
    const { code } = transformSync({
      code: 'const d = (el: any, v: any) => v; const s = () => ({ color: "red" });\nexport function F() { return <div use:x={[d, 1]} style={s()} />; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('use')
    expect(code).toContain('style')
  })
})
