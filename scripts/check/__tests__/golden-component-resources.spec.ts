import { createServer } from 'node:http'

import { runGoldenBrowserWithResources } from '../golden-component-resources'

describe('Golden browser resources', () => {
  it('returns a failed result when preview startup fails', async () => {
    const launchBrowser = vi.fn()
    const result = await runGoldenBrowserWithResources({
      consumer: 'native',
      browser: 'chromium',
      startPreview: async () => {
        throw new Error('preview startup failed')
      },
      launchBrowser,
      check: async () => ({ status: 'passed' }),
    })
    expect(result).toMatchObject({
      status: 'failed',
      stage: 'preview-start',
      error: 'Error: preview startup failed',
    })
    expect(launchBrowser).not.toHaveBeenCalled()
  })

  it('closes the preview if browser launch fails', async () => {
    const close = vi.fn(async () => {})
    const result = await runGoldenBrowserWithResources({
      consumer: 'native',
      browser: 'chromium',
      startPreview: async () => ({ url: 'http://127.0.0.1', close }),
      launchBrowser: async () => {
        throw new Error('browser launch failed')
      },
      check: async () => ({ status: 'passed' }),
    })
    expect(result).toMatchObject({ status: 'failed', stage: 'browser-launch' })
    expect(close).toHaveBeenCalledOnce()
  })

  it('closes a real preview server and reports a rejected browser close', async () => {
    const server = createServer()
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
    try {
      const result = await runGoldenBrowserWithResources({
        consumer: 'native',
        browser: 'chromium',
        startPreview: async () => ({
          url: 'http://127.0.0.1',
          close: () =>
            new Promise<void>((resolve, reject) =>
              server.close(error => (error ? reject(error) : resolve())),
            ),
        }),
        launchBrowser: async () => ({
          close: async () => {
            throw new Error('browser close failed')
          },
        }),
        check: async () => ({ status: 'passed' }),
      })
      expect(result).toMatchObject({
        status: 'failed',
        cleanupErrors: ['browser: Error: browser close failed'],
      })
      expect(server.listening).toBe(false)
    } finally {
      server.closeAllConnections()
      await new Promise<void>(resolve => server.close(() => resolve()))
    }
  })

  it('retains both cleanup failures and attempts an available browser kill', async () => {
    const kill = vi.fn(async () => {})
    const result = await runGoldenBrowserWithResources({
      consumer: 'native',
      browser: 'chromium',
      startPreview: async () => ({
        url: 'http://127.0.0.1',
        close: async () => {
          throw new Error('preview close failed')
        },
      }),
      launchBrowser: async () => ({
        close: async () => {
          throw new Error('browser close failed')
        },
        kill,
      }),
      check: async () => ({ status: 'passed' }),
    })
    expect(result).toMatchObject({
      status: 'failed',
      cleanupErrors: [
        'browser: Error: browser close failed',
        'preview: Error: preview close failed',
      ],
    })
    expect(kill).toHaveBeenCalledOnce()
  })

  it('bounds a hanging close, kills its owned browser and still closes preview', async () => {
    vi.useFakeTimers()
    try {
      const kill = vi.fn(async () => {})
      const closePreview = vi.fn(async () => {})
      const pending = runGoldenBrowserWithResources({
        consumer: 'native',
        browser: 'chromium',
        startPreview: async () => ({
          url: 'http://127.0.0.1',
          close: closePreview,
        }),
        launchBrowser: async () => ({
          close: () => new Promise<void>(() => {}),
          kill,
        }),
        check: async () => ({ status: 'passed' }),
      })
      await vi.advanceTimersByTimeAsync(6_000)
      const result = await pending
      expect(result.status).toBe('failed')
      expect(result.cleanupErrors).toEqual([
        'browser: Error: close exceeded 5000ms',
      ])
      expect(kill).toHaveBeenCalledOnce()
      expect(closePreview).toHaveBeenCalledOnce()
    } finally {
      vi.useRealTimers()
    }
  })
})
