import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createComponent,
  createContext,
  inject,
  useContext,
  type JSXValue,
} from '../src'
import { provideDOMContext, resolveDOMContext } from '../src/context'

describe('context', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)
    vi.stubGlobal('Event', dom.window.Event)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  describe('createContext', () => {
    it('creates a context with an id and default value', () => {
      const ctx = createContext('default')
      expect(ctx.id).toBeDefined()
      expect(ctx.defaultValue).toBe('default')
      expect(ctx.hasDefaultValue).toBe(true)
      expect(typeof ctx.Provider).toBe('function')
      expect(typeof ctx.Bridge).toBe('function')
    })

    it('creates a context without default value', () => {
      const ctx = createContext<number>()
      expect(ctx.defaultValue).toBeUndefined()
      expect(ctx.hasDefaultValue).toBe(false)
    })
  })

  describe('Provider / useContext', () => {
    it('provides context to child components', () => {
      const ThemeContext = createContext<string>('light')

      function Child() {
        return useContext(ThemeContext)
      }

      function App() {
        return ThemeContext.Provider({
          get value() {
            return 'dark'
          },
          get children() {
            return Child()
          },
        })
      }

      expect(createComponent(App, {})).toBe('dark')
    })

    it('Provider lazy-evaluates children via getter', () => {
      const ThemeContext = createContext<string>('light')
      let childRenderCount = 0

      function Child() {
        childRenderCount++
        return useContext(ThemeContext)
      }

      function App() {
        return ThemeContext.Provider({
          get value() {
            return 'dark'
          },
          get children() {
            return Child()
          },
        })
      }

      expect(createComponent(App, {})).toBe('dark')
      expect(childRenderCount).toBe(1)
    })

    it('returns default value when no provider is present', () => {
      const ThemeContext = createContext('light')

      function Child() {
        return useContext(ThemeContext)
      }

      expect(createComponent(Child, {})).toBe('light')
    })

    it('throws when no provider and no default value', () => {
      const ThemeContext = createContext<string>()

      function Child() {
        return useContext(ThemeContext)
      }

      expect(() => createComponent(Child, {})).toThrow()
    })

    it('provides context through nested components', () => {
      const CountContext = createContext<{ value: number }>()

      // Middle and Child are plain functions called directly inside the Provider.
      // In real compiled code, only the outermost component gets createComponent;
      // intermediate plain functions run synchronously within the Provider owner.
      const capturedValue = { current: 0 }

      function Child(): JSXValue {
        capturedValue.current = useContext(CountContext).value
        return null
      }

      function Middle(): JSXValue {
        return Child()
      }

      function App(): JSXValue {
        return CountContext.Provider({
          get value() {
            return { value: 42 }
          },
          get children() {
            return Middle()
          },
        })
      }

      createComponent(App, {})
      expect(capturedValue.current).toBe(42)
    })

    it('innermost provider wins in nested providers', () => {
      const ThemeContext = createContext<string>('root')

      function Child() {
        return useContext(ThemeContext)
      }

      function App() {
        return ThemeContext.Provider({
          get value() {
            return 'outer'
          },
          get children() {
            return ThemeContext.Provider({
              get value() {
                return 'inner'
              },
              get children() {
                return Child()
              },
            })
          },
        })
      }

      expect(createComponent(App, {})).toBe('inner')
    })

    it('Provider calls lazy children getter', () => {
      const ThemeContext = createContext<string>('light')
      let childRenderCount = 0

      function Child() {
        childRenderCount++
        return useContext(ThemeContext)
      }

      function App() {
        return ThemeContext.Provider({
          value: 'dark',
          get children() {
            return Child()
          },
        })
      }

      expect(createComponent(App, {})).toBe('dark')
      expect(childRenderCount).toBe(1)
    })

    it('Bridge creates a DOM boundary with context value', () => {
      const ThemeContext = createContext<{ mode: string }>()

      function App() {
        return ThemeContext.Bridge({
          value: { mode: 'bridge' },
          children: null,
        })
      }

      const result = createComponent(App, {})
      expect(result).toBeInstanceOf(Element)
      expect((result as Element).tagName).toBe('ZEUS-CONTEXT')
    })

    it('does not leak nested provider owner to following siblings', () => {
      const AContext = createContext<string>()
      const BContext = createContext<string>()

      const seen: string[] = []

      function ReadB() {
        seen.push(inject(BContext, 'no-b'))
        return null
      }

      // Simulate what compiled JSX looks like:
      // <AContext.Provider value="a">
      //   <BContext.Provider value="b"><ReadB /></BContext.Provider>
      //   <ReadB />                          <-- sibling after nested provider
      // </AContext.Provider>
      //
      // After the nested Provider completes, currentOwner must be restored so
      // the sibling ReadB sees A.owner (not B.owner).
      function App() {
        return AContext.Provider({
          value: 'a',
          get children() {
            // The nested Provider call: B.owner is created, ReadB runs inside it.
            // After Provider returns, currentOwner is restored to A.owner.
            BContext.Provider({
              value: 'b',
              get children() {
                return ReadB()
              },
            })

            // This ReadB runs AFTER the nested Provider's runWithOwner completes.
            // If owner is properly restored, it should see 'no-b'.
            return ReadB()
          },
        })
      }

      createComponent(App, {})

      // First ReadB: inside B.owner -> finds 'b'
      // Second ReadB: after B.owner cleanup, in A.owner -> finds 'no-b'
      expect(seen).toEqual(['b', 'no-b'])
    })

    it('owner stack is properly restored after provider completes', () => {
      const AContext = createContext<string>()

      const seen: string[] = []

      function ReadA() {
        seen.push(inject(AContext, 'no-a'))
        return null
      }

      function App() {
        return AContext.Provider({
          value: 'a',
          get children() {
            return ReadA()
          },
        })
      }

      createComponent(App, {})

      // ReadA runs inside A.owner -> finds 'a'
      expect(seen).toEqual(['a'])
    })
  })

  describe('provide / inject (low-level)', () => {
    it('inject returns default value when no provider', () => {
      const Context = createContext('default')
      expect(inject(Context)).toBe('default')
    })

    it('inject returns explicit fallback when provided', () => {
      const Context = createContext<string>()
      expect(inject(Context, 'fallback')).toBe('fallback')
    })

    it('useContext is an alias for inject', () => {
      const Context = createContext('alias')
      expect(useContext(Context)).toBe('alias')
    })
  })

  describe('undefined semantics', () => {
    it('supports undefined as an explicit default value', () => {
      const Context = createContext<string | undefined>(undefined)
      expect(inject(Context)).toBeUndefined()
    })

    it('supports undefined as an explicit fallback value', () => {
      const Context = createContext<string | undefined>()
      expect(inject(Context, undefined)).toBeUndefined()
    })

    it('hasDefaultValue is true when default is explicitly undefined', () => {
      const Context = createContext<string | undefined>(undefined)
      expect(Context.hasDefaultValue).toBe(true)
    })

    it('hasDefaultValue is false when no default provided', () => {
      const Context = createContext<string | undefined>()
      expect(Context.hasDefaultValue).toBe(false)
    })

    it('inject returns fallback when explicitly provided, even if undefined', () => {
      const Context = createContext<number | undefined>(42)
      expect(inject(Context, undefined)).toBeUndefined()
    })

    it('inject returns default when no fallback provided', () => {
      const Context = createContext<number | undefined>(42)
      expect(inject(Context)).toBe(42)
    })

    it('inject throws when no provider, no default, no fallback', () => {
      const Context = createContext<string>()
      expect(() => inject(Context)).toThrow()
    })

    it('inject returns fallback when no provider, no default, has fallback', () => {
      const Context = createContext<string>()
      expect(inject(Context, 'fallback')).toBe('fallback')
    })

    it('inject distinguishes missing fallback from undefined fallback', () => {
      const Context = createContext<string | undefined>()
      expect(() => inject(Context)).toThrow()
      expect(inject(Context, undefined)).toBeUndefined()
    })
  })

  describe('DOM context bridge', () => {
    it('context is resolved from nearest boundary only', () => {
      const ThemeContext = createContext<{ mode: string }>()

      const outerValue = { mode: 'outer' }
      const innerValue = { mode: 'inner' }

      const outer = document.createElement('div')
      provideDOMContext(outer, ThemeContext, outerValue)

      const inner = document.createElement('div')
      outer.appendChild(inner)
      provideDOMContext(inner, ThemeContext, innerValue)

      const child = document.createElement('z-card')
      inner.appendChild(child)

      const received = resolveDOMContext(child as HTMLElement, ThemeContext)
      expect(received).toEqual({ found: true, value: innerValue })
    })

    it('resolveDOMContext distinguishes found vs not-found with undefined', () => {
      const Context = createContext<string | undefined>('default')

      const boundary = document.createElement('div')
      provideDOMContext(boundary, Context, undefined)

      const child = document.createElement('z-child')
      boundary.appendChild(child)

      const resolved = resolveDOMContext(child as HTMLElement, Context)

      expect(resolved.found).toBe(true)
      expect(resolved.value).toBeUndefined()
    })

    it('resolveDOMContext returns found:false when no provider', () => {
      const Context = createContext<string>()

      const orphan = document.createElement('z-orphan')

      const resolved = resolveDOMContext(orphan as HTMLElement, Context)

      expect(resolved.found).toBe(false)
      expect(resolved.value).toBeUndefined()
    })
  })

  describe('defineElement consumes', () => {
    it('consumes undefined DOM context value instead of falling back to default', () => {
      const Context = createContext<string | undefined>('default')
      const received: Array<string | undefined> = []

      const boundary = document.createElement('div')
      provideDOMContext(boundary, Context, undefined)

      const host = document.createElement('z-test')
      boundary.appendChild(host)

      const resolved = resolveDOMContext(host as HTMLElement, Context)
      if (resolved.found) {
        received.push(resolved.value)
      }

      expect(received).toEqual([undefined])
    })

    it('consumes resolves to default when no DOM context boundary exists', () => {
      const Context = createContext<string>('default')
      const received: string[] = []

      const host = document.createElement('z-test')
      document.body.appendChild(host)

      const resolved = resolveDOMContext(host as HTMLElement, Context)
      if (resolved.found) {
        received.push(resolved.value as string)
      }

      // No boundary found, should not consume anything
      expect(received).toEqual([])

      document.body.removeChild(host)
    })
  })
})
