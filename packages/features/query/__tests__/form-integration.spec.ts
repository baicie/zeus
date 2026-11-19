import { createComponent, createForm, render } from '@zeus-js/runtime-dom'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { QueryClientProvider, createQueryClient, useMutation } from '../src'

describe('native form and query mutation integration', () => {
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
    vi.stubGlobal('AbortController', dom.window.AbortController)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('submits native values through mutateAsync and invalidates the query on success', async () => {
    const client = createQueryClient()
    const invalidate = vi.spyOn(client, 'invalidateQueries')
    const formElement = document.createElement('form')
    const title = document.createElement('input')
    title.name = 'title'
    formElement.append(title)
    document.body.append(formElement)
    const container = document.createElement('div')
    document.body.append(container)

    let form!: ReturnType<typeof createForm>
    let mutation!: ReturnType<typeof useMutation>
    const dispose = render(
      () =>
        createComponent(QueryClientProvider, {
          client,
          children: () => {
            mutation = useMutation({
              mutationFn: async (values: { title: string }) => values.title,
              onSuccess: () =>
                client.invalidateQueries({ queryKey: ['items'] }),
            })
            form = createForm({
              initialValues: { title: '' },
              onSubmit: values => mutation.mutateAsync(values),
            })
            form.bind(formElement)
            return formElement
          },
        }),
      container,
    )

    title.value = 'new title'
    title.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
    const result = await form.submit()

    expect(result).toMatchObject({
      status: 'success',
      values: { title: 'new title' },
    })
    expect(mutation.data()).toBe('new title')
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['items'] })

    dispose()
    client.dispose()
  })
})
