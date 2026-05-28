import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createComponent,
  createContext,
  inject,
  useContext,
  type JSXValue,
} from '../src'
import { provideDOMContext, requestDOMContext } from '../src/context'

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
      expect(typeof ctx.Provider).toBe('function')
      expect(typeof ctx.Bridge).toBe('function')
    })

    it('creates a context without default value', () => {
      const ctx = createContext<number>()
      expect(ctx.defaultValue).toBeUndefined()
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

  describe('DOM context bridge', () => {
    it('requestDOMContext resolves value from a DOM boundary', () => {
      const ThemeContext = createContext<{ mode: string }>()

      const theme = { mode: 'dark' }
      const boundary = document.createElement('div')
      provideDOMContext(boundary, ThemeContext, theme)

      const child = document.createElement('z-child')
      boundary.appendChild(child)

      const received = requestDOMContext(child as HTMLElement, ThemeContext)
      expect(received).toBe(theme)
    })

    it('requestDOMContext returns undefined when no provider exists', () => {
      const ThemeContext = createContext<{ mode: string }>()

      const orphan = document.createElement('z-orphan')

      const received = requestDOMContext(orphan as HTMLElement, ThemeContext)
      expect(received).toBeUndefined()
    })

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

      const received = requestDOMContext(child as HTMLElement, ThemeContext)
      expect(received).toBe(innerValue)
    })
  })
})
