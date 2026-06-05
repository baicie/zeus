import type { MockInstance } from 'vitest'

declare module 'vitest' {
  interface Assertion<T = any> extends CustomMatchers<T> {}
  interface AsymmetricMatchersContaining extends CustomMatchers {}
}

interface CustomMatchers<R = unknown> {
  toHaveBeenWarned(): R
  toHaveBeenWarnedLast(): R
  toHaveBeenWarnedTimes(n: number): R
}

vi.stubGlobal('MathMLElement', class MathMLElement {})

class MockHTMLElement {
  static get observedAttributes() {
    return []
  }
  private _attributes = new Map<string, string | null>()
  private _children: Node[] = []
  private _shadowRoot: MockShadowRoot | null = null
  private _listeners = new Map<string, Set<EventListener>>()

  get shadowRoot() {
    return this._shadowRoot
  }
  get tagName() {
    return 'MOCK-ELEMENT'
  }
  get children() {
    return [] as unknown as HTMLCollection
  }
  get textContent() {
    return this._children.map(node => node.textContent ?? '').join('')
  }
  get innerHTML() {
    return ''
  }
  set innerHTML(_v: string) {}

  attachShadow(_opts: { mode: string }): ShadowRoot {
    this._shadowRoot = new MockShadowRoot()
    return this._shadowRoot as unknown as ShadowRoot
  }

  getAttribute(name: string): string | null {
    return this._attributes.get(name) ?? null
  }
  setAttribute(name: string, value: string): void {
    const oldValue = this.getAttribute(name)
    this._attributes.set(name, value)
    ;(
      this as unknown as {
        attributeChangedCallback?: (
          name: string,
          oldValue: string | null,
          newValue: string | null,
        ) => void
      }
    ).attributeChangedCallback?.(name, oldValue, value)
  }
  removeAttribute(name: string): void {
    const oldValue = this.getAttribute(name)
    this._attributes.set(name, null)
    ;(
      this as unknown as {
        attributeChangedCallback?: (
          name: string,
          oldValue: string | null,
          newValue: string | null,
        ) => void
      }
    ).attributeChangedCallback?.(name, oldValue, null)
  }
  hasAttribute(name: string): boolean {
    return this._attributes.has(name)
  }

  toggleAttribute(name: string, force?: boolean): boolean {
    const has = this._attributes.get(name) ?? null
    if (force === undefined) {
      const next = has === null ? '' : null
      if (next === null) {
        this.removeAttribute(name)
      } else {
        this.setAttribute(name, next)
      }
      return next !== null
    }
    if (force) {
      this.setAttribute(name, '')
    } else {
      this.removeAttribute(name)
    }
    return force
  }

  replaceChildren(...nodes: Node[]): void {
    this._children = nodes
  }

  appendChild<T extends Node>(_node: T): T {
    ;(_node as Node & { connectedCallback?: () => void }).connectedCallback?.()
    return _node
  }
  removeChild<T extends Node>(_node: T): T {
    ;(
      _node as Node & { disconnectedCallback?: () => void }
    ).disconnectedCallback?.()
    return _node
  }

  addEventListener(type: string, listener: EventListener): void {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set())
    this._listeners.get(type)!.add(listener)
  }
  removeEventListener(type: string, listener: EventListener): void {
    this._listeners.get(type)?.delete(listener)
  }
  dispatchEvent(_event: Event): boolean {
    return true
  }

  get className() {
    return ''
  }
  set className(_v: string) {}
  get dir() {
    return ''
  }
  set dir(_v: string) {}
  get id() {
    return ''
  }
  set id(_v: string) {}
  get style() {
    return { setProperty() {} } as unknown as CSSStyleDeclaration
  }
  get part() {
    return { add() {} } as unknown as DOMTokenList
  }
}

class MockShadowRoot {
  private _children: Node[] = []
  private _innerHTML = ''
  get textContent() {
    return this._innerHTML || this._children.map(n => n.textContent).join('')
  }
  get innerHTML() {
    return this._innerHTML
  }
  set innerHTML(value: string) {
    this._innerHTML = value
    this._children = []
  }
  replaceChildren(...nodes: Node[]): void {
    this._innerHTML = ''
    this._children = nodes
  }
}

vi.stubGlobal('HTMLElement', MockHTMLElement as unknown as typeof HTMLElement)

class TestCustomElementRegistry {
  private registry = new Map<string, CustomElementConstructor>()

  get(name: string) {
    return this.registry.get(name)
  }

  define(name: string, ctor: CustomElementConstructor) {
    if (this.registry.has(name)) {
      return
    }
    this.registry.set(name, ctor)
  }

  whenDefined(name: string): Promise<CustomElementConstructor> {
    if (this.registry.has(name)) {
      return Promise.resolve(this.registry.get(name)!)
    }
    return new Promise(resolve => {
      const check = () => {
        if (this.registry.has(name)) {
          resolve(this.registry.get(name)!)
        } else {
          setTimeout(check, 1)
        }
      }
      check()
    })
  }

  clear() {
    this.registry.clear()
  }
}

const registry = new TestCustomElementRegistry()
vi.stubGlobal('customElements', registry as unknown as CustomElementRegistry)
vi.stubGlobal('document', {
  createElement(name: string) {
    const Ctor = registry.get(name)
    return Ctor ? new Ctor() : new MockHTMLElement()
  },
  createTextNode(text: string) {
    return { textContent: text } as Node
  },
  body: new MockHTMLElement(),
})

expect.extend({
  toHaveBeenWarned(received: string) {
    const passed = warn.mock.calls.some(args => args[0].includes(received))
    if (passed) {
      asserted.add(received)
      return {
        pass: true,
        message: () => `expected "${received}" not to have been warned.`,
      }
    } else {
      const msgs = warn.mock.calls.map(args => args[0]).join('\n - ')
      return {
        pass: false,
        message: () =>
          `expected "${received}" to have been warned` +
          (msgs.length
            ? `.\n\nActual messages:\n\n - ${msgs}`
            : ` but no warning was recorded.`),
      }
    }
  },

  toHaveBeenWarnedLast(received: string) {
    const passed =
      warn.mock.calls[warn.mock.calls.length - 1][0].includes(received)
    if (passed) {
      asserted.add(received)
      return {
        pass: true,
        message: () => `expected "${received}" not to have been warned last.`,
      }
    } else {
      const msgs = warn.mock.calls.map(args => args[0]).join('\n - ')
      return {
        pass: false,
        message: () =>
          `expected "${received}" to have been warned last.\n\nActual messages:\n\n - ${msgs}`,
      }
    }
  },

  toHaveBeenWarnedTimes(received: string, n: number) {
    let found = 0
    warn.mock.calls.forEach(args => {
      if (args[0].includes(received)) {
        found++
      }
    })

    if (found === n) {
      asserted.add(received)
      return {
        pass: true,
        message: () => `expected "${received}" to have been warned ${n} times.`,
      }
    } else {
      return {
        pass: false,
        message: () =>
          `expected "${received}" to have been warned ${n} times but got ${found}.`,
      }
    }
  },
})

let warn: MockInstance
const asserted: Set<string> = new Set()

beforeEach(() => {
  asserted.clear()
  warn = vi.spyOn(console, 'warn')
  warn.mockImplementation(() => {})
})

afterEach(() => {
  const assertedArray = Array.from(asserted)
  const nonAssertedWarnings = warn.mock.calls
    .map(args => args[0])
    .filter(received => {
      return !assertedArray.some(assertedMsg => {
        return received.includes(assertedMsg)
      })
    })
  warn.mockRestore()
  if (nonAssertedWarnings.length) {
    throw new Error(
      `test case threw unexpected warnings:\n - ${nonAssertedWarnings.join(
        '\n - ',
      )}`,
    )
  }
})
