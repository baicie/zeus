import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createForm, formDataToValues, fromSafeParse } from '../src/form'

describe('native form controller', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement)
    vi.stubGlobal('HTMLSelectElement', dom.window.HTMLSelectElement)
    vi.stubGlobal('HTMLTextAreaElement', dom.window.HTMLTextAreaElement)
    vi.stubGlobal('FormData', dom.window.FormData)
    vi.stubGlobal('File', dom.window.File)
    vi.stubGlobal('AbortController', dom.window.AbortController)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('composes native FormData, schema errors and an async mutation rejection', async () => {
    const formElement = document.createElement('form')
    const email = document.createElement('input')
    email.name = 'email'
    email.required = true
    formElement.append(email)
    document.body.append(formElement)

    const onSubmit = vi.fn(async () => {
      throw new Error('mutation failed')
    })
    const onError = vi.fn()
    const form = createForm({
      initialValues: { email: '' },
      schema: fromSafeParse({
        safeParse(value: unknown) {
          const candidate = value as { email?: string }
          return candidate.email?.endsWith('@zeus.dev')
            ? { success: true as const, data: { email: candidate.email } }
            : {
                success: false as const,
                error: {
                  issues: [{ path: ['email'], message: 'Use a Zeus email' }],
                },
              }
        },
      }),
      onSubmit,
      onError,
    })
    form.bind(formElement)

    email.value = 'invalid@example.com'
    email.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    const invalid = await form.submit()
    expect(invalid.status).toBe('invalid')
    expect(form.errors().email).toBe('Use a Zeus email')
    expect(onSubmit).not.toHaveBeenCalled()

    email.value = 'user@zeus.dev'
    email.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    const rejected = await form.submit()
    expect(rejected.status).toBe('error')
    expect(onSubmit).toHaveBeenCalledWith(
      { email: 'user@zeus.dev' },
      expect.objectContaining({ form: formElement }),
    )
    expect(form.submitError()).toBeInstanceOf(Error)
    expect(onError).toHaveBeenCalledOnce()

    form.dispose()
  })

  it('does not commit an IME input until compositionend and restores on reset', async () => {
    const formElement = document.createElement('form')
    const name = document.createElement('input')
    name.name = 'name'
    formElement.append(name)
    document.body.append(formElement)

    const form = createForm({ initialValues: { name: 'initial' } })
    form.bind(formElement)

    name.value = '中'
    name.dispatchEvent(
      new dom.window.CompositionEvent('compositionstart', { bubbles: true }),
    )
    name.dispatchEvent(
      new dom.window.InputEvent('input', {
        bubbles: true,
        isComposing: true,
      }),
    )
    expect(form.values().name).toBe('initial')

    name.dispatchEvent(
      new dom.window.CompositionEvent('compositionend', { bubbles: true }),
    )
    expect(form.values().name).toBe('中')

    form.setError('name', 'bad')
    form.reset()
    await Promise.resolve()
    expect(form.values().name).toBe('initial')
    expect(form.errors()).toEqual({})
    expect(name.value).toBe('initial')

    form.dispose()
  })

  it('keeps repeated native entries and controlled overrides in FormData', () => {
    const formElement = document.createElement('form')
    const tagA = document.createElement('input')
    tagA.name = 'tag'
    tagA.value = 'a'
    const tagB = document.createElement('input')
    tagB.name = 'tag'
    tagB.value = 'b'
    formElement.append(tagA, tagB)
    document.body.append(formElement)

    const form = createForm({ initialValues: { tag: '' } })
    form.bind(formElement)
    form.setValue('tag', 'controlled')

    expect(formDataToValues(new FormData(formElement))).toEqual({
      tag: ['a', 'b'],
    })
    expect(Array.from(form.formData().getAll('tag'))).toEqual(['controlled'])

    form.dispose()
  })
})
