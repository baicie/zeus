import { describe, expect, it, vi } from 'vitest'

import { createZeus } from '../src'

import type { HookHandler, Plugin, ResolvedConfig } from 'vite'

const source = `import { render, createSignal } from '@zeus-js/zeus';
const [count, setCount] = createSignal(0);
render(() => <button class={'before'} onClick={() => setCount(count() + 1)}>{'Hello'} {count()}</button>, document.body);
`

function harness(preserveBindings = true, environmentName = 'client') {
  const plugin = createZeus({ hmr: { preserveBindings } })
  const config = plugin.configResolved as HookHandler<Plugin['configResolved']>
  const transform = plugin.transform as HookHandler<Plugin['transform']>
  const update = plugin.hotUpdate as HookHandler<Plugin['hotUpdate']>
  config?.call(
    {} as ThisParameterType<NonNullable<typeof config>>,
    { command: 'serve' } as ResolvedConfig,
  )
  const send = vi.fn()
  const invalidateModule = vi.fn()
  const debug = vi.fn()
  const transformSource = (text: string) =>
    transform!.call(
      {
        error: (error: unknown) => {
          throw error
        },
      } as ThisParameterType<NonNullable<typeof transform>>,
      text,
      '/src/main.tsx',
      undefined,
    )
  const updateSource = (text: string) =>
    update!.call(
      {
        debug,
        environment: {
          name: environmentName,
          hot: { send },
          moduleGraph: { invalidateModule },
        },
      } as unknown as ThisParameterType<NonNullable<typeof update>>,
      {
        type: 'update',
        file: '/src/main.tsx',
        modules: [],
        read: async () => text,
        server: {},
      } as unknown as Parameters<NonNullable<typeof update>>[0],
    )
  return { transformSource, updateSource, send, invalidateModule, debug }
}

describe('compiler-driven Vite binding preservation', () => {
  it('sends only compiler-certified data and keeps consecutive patches based on the last good plan', async () => {
    const { transformSource, updateSource, send, debug } = harness()
    await transformSource(source)
    const first = source.replace("'before'", "'after'")
    expect(await updateSource(first)).toEqual([])
    expect(send).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ type: 'custom', event: 'zeus:hmr-patch' }),
    )
    const firstPatch = send.mock.calls[0][0].data
    expect(firstPatch.previous.signature).toBe(firstPatch.next.signature)
    expect(firstPatch.previous.bindings).not.toEqual(firstPatch.next.bindings)
    expect(await updateSource(first.replace("'after'", "'third'"))).toEqual([])
    expect(send.mock.calls[2][0].data.previous).toEqual(firstPatch.next)
    expect(debug).toHaveBeenCalledWith(
      expect.stringContaining('literal-bindings -> preserve-state'),
    )
  })

  it.each([false, true])(
    'remounts unsafe changes with preserveBindings=%s',
    async enabled => {
      const { transformSource, updateSource, send } = harness(enabled)
      await transformSource(source)
      expect(
        await updateSource(
          source.replace('createSignal(0)', 'createSignal(1)'),
        ),
      ).toBeUndefined()
      expect(send).not.toHaveBeenCalled()
      if (!enabled) {
        expect(
          await updateSource(source.replace("'before'", "'after'")),
        ).toBeUndefined()
        expect(send).not.toHaveBeenCalled()
      }
    },
  )

  it('keeps the last successful plan through a compile error', async () => {
    const { transformSource, updateSource, send } = harness()
    await transformSource(source)
    expect(
      await updateSource(source.replace('</button>', '</broken>')),
    ).toEqual([])
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ type: 'error' }),
    )
    expect(
      await updateSource(source.replace("'Hello'", "'Recovered'")),
    ).toEqual([])
    expect(
      send.mock.calls[2][0].data.previous.bindings.some(
        (binding: { value: string }) => binding.value === 'Hello',
      ),
    ).toBe(true)
  })

  it('only handles the client environment', async () => {
    const { transformSource, updateSource, send } = harness(true, 'ssr')
    await transformSource(source)
    expect(
      await updateSource(source.replace("'before'", "'after'")),
    ).toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  })
})
