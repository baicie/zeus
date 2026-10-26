interface Resource {
  close(): Promise<void>
  kill?(): Promise<void>
}

interface Preview extends Resource {
  url: string
}

interface GoldenBrowserResources<TBrowser extends Resource> {
  consumer: string
  browser: string
  startPreview(): Promise<Preview>
  launchBrowser(): Promise<TBrowser>
  check(browser: TBrowser, url: string): Promise<Record<string, unknown>>
}

export async function runGoldenBrowserWithResources<TBrowser extends Resource>(
  options: GoldenBrowserResources<TBrowser>,
): Promise<Record<string, unknown>> {
  const context = { consumer: options.consumer, browser: options.browser }
  let preview: Preview | undefined
  let browser: TBrowser | undefined
  let stage = 'preview-start'
  let result: Record<string, unknown> = { ...context, status: 'failed' }
  try {
    preview = await options.startPreview()
    stage = 'browser-launch'
    browser = await options.launchBrowser()
    stage = 'browser-check'
    result = { ...(await options.check(browser, preview.url)), ...context }
  } catch (error) {
    result = { ...context, status: 'failed', stage, error: String(error) }
  } finally {
    const cleanupErrors: string[] = []
    const close = async (name: string, resource?: Resource): Promise<void> => {
      if (!resource) return
      try {
        await withCloseDeadline(() => resource.close())
      } catch (error) {
        cleanupErrors.push(`${name}: ${String(error)}`)
        const kill = resource.kill
        if (kill) {
          try {
            await withCloseDeadline(() => kill.call(resource))
          } catch (killError) {
            cleanupErrors.push(`${name} kill: ${String(killError)}`)
          }
        }
      }
    }
    try {
      await close('browser', browser)
    } finally {
      await close('preview', preview)
    }
    if (cleanupErrors.length)
      result = {
        ...result,
        status: 'failed',
        stage: result.stage ?? 'browser-cleanup',
        cleanupErrors,
      }
  }
  return result
}

export async function withCloseDeadline(
  close: () => Promise<void>,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      Promise.resolve().then(close),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('close exceeded 5000ms')),
          5_000,
        )
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}
