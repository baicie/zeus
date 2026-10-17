import { describe, expect, it, vi } from 'vitest'

import { mergeProps, renderToString, ssrElement, ssrSpread } from '../src'

describe('SSR ordered JSX spread', () => {
  it('normalizes platform aliases before source precedence and serialization', () => {
    expect(
      renderToString(() =>
        ssrElement(
          'label',
          ssrSpread([() => ({ htmlFor: 'first', for: 'last', tabIndex: 2 })]),
        ),
      ),
    ).toBe('<label for="last" tabindex="2"></label>')
  })
  it('applies the same override, aliases and serialization rules as native DOM', () => {
    const handler = vi.fn()
    const ref = vi.fn()
    const html = renderToString(() =>
      ssrElement(
        'input',
        ssrSpread([
          () => ({
            id: 'base',
            title: 'first',
            className: 'base',
            onClick: handler,
            ref,
          }),
          () => ({ id: 'fixed', title: 'middle', 'prop:value': 'typed' }),
          () => ({
            title: undefined,
            class: 'last',
            style: { lineHeight: 2 },
            disabled: true,
          }),
        ]),
      ),
    )
    expect(html).toBe(
      '<input id="fixed" value="typed" class="last" style="line-height:2" disabled>',
    )
    expect(handler).not.toHaveBeenCalled()
    expect(ref).not.toHaveBeenCalled()
  })

  it('keeps component getters, function values and explicit undefined overrides', () => {
    const callback = vi.fn()
    const source = vi.fn(() => ({
      get title() {
        return 'first'
      },
      formatter: callback,
    }))
    const props = mergeProps([source, () => ({ title: undefined })])
    expect(props.title).toBeUndefined()
    expect(props.formatter).toBe(callback)
    expect(Object.keys(props)).toEqual(['title', 'formatter'])
    expect(source).toHaveBeenCalledTimes(1)
    expect(callback).not.toHaveBeenCalled()
  })

  it('rejects structural DOM mutation and function attributes before serialization', () => {
    expect(() => ssrSpread([() => ({ innerHTML: '<b>unsafe</b>' })])).toThrow(
      'structural DOM property',
    )
    expect(() => ssrSpread([() => ({ title: () => 'ambiguous' })])).toThrow(
      'cannot contain a function',
    )
  })
})

describe('SSR spread boundary regressions', () => {
  it('rejects dynamic attribute names before writing HTML', () => {
    expect(() =>
      renderToString(() =>
        ssrElement(
          'div',
          ssrSpread([() => ({ ['x onmouseover="alert(1)" y']: 'value' })]),
        ),
      ),
    ).toThrow('Invalid SSR attribute name')
  })

  it('preserves channel order when an attribute follows a reflected property', () => {
    expect(
      renderToString(() =>
        ssrElement(
          'input',
          ssrSpread([
            () => ({ 'prop:disabled': true }),
            () => ({ disabled: false }),
          ]),
        ),
      ),
    ).toBe('<input>')
    expect(
      renderToString(() =>
        ssrElement(
          'input',
          ssrSpread([
            () => ({ disabled: false }),
            () => ({ 'prop:disabled': true }),
          ]),
        ),
      ),
    ).toBe('<input disabled>')
  })

  it('keeps the latest binding position when a key is defined again', () => {
    expect(
      renderToString(() =>
        ssrElement(
          'input',
          ssrSpread([
            () => ({ disabled: false }),
            () => ({ 'prop:disabled': true }),
            () => ({ disabled: false }),
          ]),
        ),
      ),
    ).toBe('<input>')
  })
})

it('reads spread getters before evaluating the following source expression', () => {
  let value = 'first'
  const calls: string[] = []
  const html = renderToString(() =>
    ssrElement(
      'div',
      ssrSpread([
        () => ({
          get title() {
            calls.push('getter')
            return value
          },
        }),
        () => {
          calls.push('later')
          value = 'second'
          return {}
        },
      ]),
    ),
  )
  expect(html).toBe('<div title="first"></div>')
  expect(calls).toEqual(['getter', 'later'])
})
