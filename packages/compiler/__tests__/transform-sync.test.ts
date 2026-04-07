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

  it('compiles nested jsx children in dom element', () => {
    const { code } = transformSync({
      code: 'export function F() { const x = 1; return <div>pre<span>a</span>{x}<Foo bar={1} /></div>; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('insert')
    expect(code).toContain('createComponent')
    expect(code).toContain('template')
  })

  it('compiles top-level svg child tag with wrapper firstChild access', () => {
    const { code } = transformSync({
      code: 'export function F() { return <circle cx="10" cy="10" r="5" />; }\n',
      filename: 't.tsx',
    })
    expect(code).toContain('<svg><circle')
    expect(code).toContain('firstChild')
  })

  it('wraps conditional child with memo when wrapConditionals enabled', () => {
    const { code } = transformSync({
      code: 'export function F() { const ok = true; return <div>{ok ? "a" : "b"}</div>; }\n',
      filename: 't.tsx',
      options: { wrapConditionals: true },
    })
    expect(code).toContain('memo')
  })

  it('does not wrap conditional child when wrapConditionals disabled', () => {
    const { code } = transformSync({
      code: 'export function F() { const ok = true; return <div>{ok ? "a" : "b"}</div>; }\n',
      filename: 't.tsx',
      options: { wrapConditionals: false },
    })
    expect(code).not.toContain('memo')
  })

  it('uses renderList helper for map child expression', () => {
    const { code } = transformSync({
      code: 'export function F() { const list = [1, 2, 3]; return <div>{list.map(i => i)}</div>; }\n',
      filename: 't.tsx',
      options: { wrapConditionals: false },
    })
    expect(code).toContain('renderList')
    expect(code).toContain('() => list')
  })

  it('uses renderList when mapper returns jsx element', () => {
    const { code } = transformSync({
      code: 'export function F() { const list = [1, 2, 3]; return <div>{list.map(i => <span>{i}</span>)}</div>; }\n',
      filename: 't.tsx',
      options: { wrapConditionals: false },
    })
    expect(code).toContain('renderList')
    expect(code).toContain('<span')
    expect(code).toContain('insert')
  })

  it('uses jsx key expression as renderList keyFn when available', () => {
    const { code } = transformSync({
      code: 'export function F() { const list = [{ id: 1 }]; return <div>{list.map((item, i) => <span key={item.id}>{i}</span>)}</div>; }\n',
      filename: 't.tsx',
      options: { wrapConditionals: false },
    })
    expect(code).toContain('renderList')
    expect(code).toContain('item.id')
  })

  it('falls back to index keyFn for complex mapper return', () => {
    const { code } = transformSync({
      code: 'export function F() { const list = [{ id: 1 }]; return <div>{list.map((item, i) => { if (i > 0) return <span key={item.id}>{i}</span>; return <span>{i}</span>; })}</div>; }\n',
      filename: 't.tsx',
      options: { wrapConditionals: false },
    })
    expect(code).toContain('renderList')
    expect(code).toContain('(item, index) => index')
  })

  it('falls back to index keyFn when mapper has non-jsx return', () => {
    const { code } = transformSync({
      code: 'export function F() { const list = [{ id: 1 }]; return <div>{list.map((item, i) => { return i > 0 ? item.id : item; })}</div>; }\n',
      filename: 't.tsx',
      options: { wrapConditionals: false },
    })
    expect(code).toContain('renderList')
    expect(code).toContain('(item, index) => index')
  })

  it('compiles basic ssr generate mode for element', () => {
    const { code } = transformSync({
      code: 'export function F() { const n = 1; return <div id="a">{n}</div>; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('"<div" + " id=\\"a\\"" + ">"')
    expect(code).toContain('String(n)')
  })

  it('normalizes className and ignores on* in ssr mode', () => {
    const { code } = transformSync({
      code: 'const h = () => {}; export function F() { return <div className="a" onClick={h} />; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('class=\\"a\\"')
    expect(code).not.toContain('onClick')
  })

  it('compiles fragment in ssr mode as string concat', () => {
    const { code } = transformSync({
      code: 'export function F() { const n = 1; return <>a<span>{n}</span></>; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('<span')
    expect(code).toContain('String(n)')
    expect(code).not.toContain('Fragment')
  })

  it('folds static style object in ssr mode', () => {
    const { code } = transformSync({
      code: 'export function F() { return <div style={{ color: "red", fontSize: 12 }} />; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('style=\\"color:red;font-size:12\\"')
  })

  it('keeps dynamic style expression fallback in ssr mode', () => {
    const { code } = transformSync({
      code: 'export function F() { const s = { color: "red" }; return <div style={s} />; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('String(s)')
  })

  it('supports dangerouslySetInnerHTML in ssr mode', () => {
    const { code } = transformSync({
      code: 'export function F() { const html = "<b>x</b>"; return <div dangerouslySetInnerHTML={{ __html: html }} />; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('String(html)')
    expect(code).not.toContain('dangerouslySetInnerHTML')
  })

  it('ignores children when dangerouslySetInnerHTML is set in ssr mode', () => {
    const { code } = transformSync({
      code: 'export function F() { return <div dangerouslySetInnerHTML={{ __html: "<i>x</i>" }}>child</div>; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('String("<i>x</i>")')
    expect(code).not.toContain('child')
  })

  it('does not emit closing tag for void elements in ssr mode', () => {
    const { code } = transformSync({
      code: 'export function F() { return <img alt="x">child</img>; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('<img')
    expect(code).not.toContain('</img>')
    expect(code).not.toContain('child')
  })

  it('renders textarea value as content in ssr mode', () => {
    const { code } = transformSync({
      code: 'export function F() { return <textarea value={"hello"}>child</textarea>; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('<textarea')
    expect(code).toContain('hello')
    expect(code).not.toContain(' value=')
    expect(code).not.toContain('child')
  })

  it('renders option selected boolean expression in ssr mode', () => {
    const { code } = transformSync({
      code: 'export function F() { const ok = true; return <option selected={ok}>A</option>; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).toContain('? " selected" : ""')
  })

  it('adds hydration marker in ssr mode when hydratable=true', () => {
    const { code } = transformSync({
      code: 'export function F() { return <div id="a">x</div>; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr', hydratable: true },
    })
    expect(code).toContain('data-hk=\\"\\"')
  })

  it('collects hydratable events in ssr mode', () => {
    const { code } = transformSync({
      code: 'const h = () => {}; export function F() { return <div onClick={h}>x</div>; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr', hydratable: true },
    })
    expect(code).toContain('ssrHydrationEvents')
    expect(code).toContain('"name": "click"')
    expect(code).toContain('"strategy": "delegate"')
    expect(code).not.toContain('delegateEvents')
  })

  it('supports configurable hydration event strategy in ssr mode', () => {
    const { code } = transformSync({
      code: 'const h = () => {}; export function F() { return <div onClick={h}>x</div>; }\n',
      filename: 't.tsx',
      options: {
        generate: 'ssr',
        hydratable: true,
        hydrationEventStrategy: 'native',
      },
    })
    expect(code).toContain('ssrHydrationEvents')
    expect(code).toContain('"name": "click"')
    expect(code).toContain('"strategy": "native"')
  })

  it('falls back to delegate strategy for invalid strategy config', () => {
    const { code } = transformSync({
      code: 'const h = () => {}; export function F() { return <div onClick={h}>x</div>; }\n',
      filename: 't.tsx',
      options: {
        generate: 'ssr',
        hydratable: true,
        hydrationEventStrategy: 'native',
        hydrationEventStrategies: {
          click: 'invalid' as never,
        },
      },
    })
    expect(code).toContain('"name": "click"')
    expect(code).toContain('"strategy": "native"')
  })

  it('falls back to delegate when default hydration strategy is invalid', () => {
    const { code } = transformSync({
      code: 'const h = () => {}; export function F() { return <div onClick={h}>x</div>; }\n',
      filename: 't.tsx',
      options: {
        generate: 'ssr',
        hydratable: true,
        hydrationEventStrategy: 'invalid' as never,
      },
    })
    expect(code).toContain('"name": "click"')
    expect(code).toContain('"strategy": "delegate"')
  })

  it('imports ssr hydration helper from ssrModuleName when provided', () => {
    const { code } = transformSync({
      code: 'const h = () => {}; export function F() { return <div onClick={h}>x</div>; }\n',
      filename: 't.tsx',
      options: {
        generate: 'ssr',
        hydratable: true,
        ssrModuleName: '@zeus-js/server-renderer',
      },
    })
    expect(code).toContain('from "@zeus-js/server-renderer"')
    expect(code).toContain('ssrHydrationEvents')
    expect(code).toContain('"strategy": "delegate"')
    expect(code).not.toContain('applyHydrationEvents')
    expect(code).not.toContain('dispose')
    expect(code).not.toContain('eventTargetsByName')
    expect(code).not.toContain('supportsEventListenerOptions')
    expect(code).not.toContain('optionFallbackCount')
    expect(code).not.toContain('getHydrationCapabilitySnapshot')
  })

  it('does not add hydration marker in ssr mode by default', () => {
    const { code } = transformSync({
      code: 'export function F() { return <div id="a">x</div>; }\n',
      filename: 't.tsx',
      options: { generate: 'ssr' },
    })
    expect(code).not.toContain('data-hk=\\"\\"')
  })

  it('throws when hydratable is used in dom mode', () => {
    expect(() =>
      transformSync({
        code: 'const h = () => {}; export function F() { return <div onClick={h}>x</div>; }\n',
        filename: 't.tsx',
        options: { generate: 'dom', hydratable: true },
      }),
    ).toThrow('SSR-only options are not supported')
  })

  it('throws when non-ssr uses hydrationEventStrategy', () => {
    expect(() =>
      transformSync({
        code: 'export function F() { return <div>x</div>; }\n',
        filename: 't.tsx',
        options: {
          generate: 'universal',
          hydrationEventStrategy: 'native',
        },
      }),
    ).toThrow('hydrationEventStrategy')
  })

  it('throws when non-ssr uses hydrationEventStrategies', () => {
    expect(() =>
      transformSync({
        code: 'export function F() { return <div>x</div>; }\n',
        filename: 't.tsx',
        options: {
          generate: 'dom',
          hydrationEventStrategies: { click: 'native' },
        },
      }),
    ).toThrow('hydrationEventStrategies')
  })

  it('throws when non-ssr overrides ssrModuleName', () => {
    expect(() =>
      transformSync({
        code: 'export function F() { return <div>x</div>; }\n',
        filename: 't.tsx',
        options: {
          generate: 'universal',
          ssrModuleName: '@zeus-js/server-renderer',
        },
      }),
    ).toThrow('ssrModuleName')
  })

  it('compiles basic universal mode without not-implemented error', () => {
    const { code } = transformSync({
      code: 'export function F() { const n = 1; return <div class="a">{n}</div>; }\n',
      filename: 't.tsx',
      options: { generate: 'universal' },
    })
    expect(code).toContain('template')
    expect(code).toContain('insert')
    expect(code).not.toContain('not implemented yet')
  })

  it('compiles fragment in universal mode', () => {
    const { code } = transformSync({
      code: 'export function F() { return <><span>a</span><Foo bar={1} /></>; }\n',
      filename: 't.tsx',
      options: { generate: 'universal' },
    })
    expect(code).toContain('createComponent')
    expect(code).toContain('Fragment')
  })

  it('keeps dom-style delegation path in universal mode', () => {
    const { code } = transformSync({
      code: 'const h = () => {}; export function F() { return <button onClick={h}>x</button>; }\n',
      filename: 't.tsx',
      options: { generate: 'universal' },
    })
    expect(code).toContain('delegateEvents')
    expect(code).toContain('$$click')
    expect(code).not.toContain('ssrHydrationEvents')
  })

  it('throws when hydratable is used in universal mode', () => {
    expect(() =>
      transformSync({
        code: 'const h = () => {}; export function F() { return <button onClick={h}>x</button>; }\n',
        filename: 't.tsx',
        options: { generate: 'universal', hydratable: true },
      }),
    ).toThrow('SSR-only options are not supported')
  })
})
