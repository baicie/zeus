import { describe, expect, it } from 'vitest'

function isBrowserMatrixEnabled(): boolean {
  return process.env.HYDRATION_BROWSER_MATRIX === '1'
}

function shouldRunBrowser(browser: 'chromium' | 'firefox' | 'webkit'): boolean {
  const raw = process.env.HYDRATION_BROWSERS
  if (!raw) {
    return true
  }
  const list = raw
    .split(',')
    .map(item => item.trim().toLowerCase())
    .filter(Boolean)
  return list.indexOf(browser) !== -1
}

async function probeEventOptionsWithPuppeteer(
  launchOptions?: Record<string, unknown>,
) {
  let puppeteer: any
  try {
    puppeteer = await import('puppeteer')
  } catch (_err) {
    return null
  }
  let browser: any
  try {
    browser = await puppeteer.launch(
      Object.assign({ headless: true }, launchOptions || {}),
    )
    const page = await browser.newPage()
    const result = await page.evaluate(() => {
      let support = false
      try {
        const opts: Record<string, unknown> = {}
        Object.defineProperty(opts, 'capture', {
          get() {
            support = true
            return false
          },
        })
        const listener = () => {}
        window.addEventListener('__probe__', listener, opts)
        window.removeEventListener('__probe__', listener)
      } catch (_e) {
        support = false
      }
      return support
    })
    await page.close()
    return result
  } catch (_err) {
    return null
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

async function probeEventOptionsWithPlaywright(
  browserType: 'chromium' | 'firefox' | 'webkit',
) {
  let playwright: any
  try {
    const dynamicImport = new Function('specifier', 'return import(specifier)')
    playwright = await dynamicImport('playwright')
  } catch (_err) {
    return null
  }
  const type = playwright[browserType]
  if (!type || typeof type.launch !== 'function') {
    return null
  }
  let browser: any
  try {
    browser = await type.launch({ headless: true })
    const page = await browser.newPage()
    const result = await page.evaluate(() => {
      let support = false
      try {
        const opts: Record<string, unknown> = {}
        Object.defineProperty(opts, 'capture', {
          get() {
            support = true
            return false
          },
        })
        const listener = () => {}
        window.addEventListener('__probe__', listener, opts)
        window.removeEventListener('__probe__', listener)
      } catch (_e) {
        support = false
      }
      return support
    })
    await page.close()
    return result
  } catch (_err) {
    return null
  } finally {
    if (browser) {
      await browser.close()
    }
  }
}

describe('hydration browser matrix skeleton', () => {
  it('chromium smoke (optional)', async () => {
    if (!isBrowserMatrixEnabled() || !shouldRunBrowser('chromium')) {
      return
    }
    let puppeteer: any
    try {
      puppeteer = await import('puppeteer')
    } catch (_err) {
      return
    }
    let browser: any
    try {
      browser = await puppeteer.launch({ headless: true })
      expect(browser).toBeTruthy()
    } catch (_err) {
      // 环境不具备浏览器运行条件时跳过
      return
    }
    await browser.close()
  })

  it('chromium event options probe (optional)', async () => {
    if (!isBrowserMatrixEnabled() || !shouldRunBrowser('chromium')) {
      return
    }
    const result = await probeEventOptionsWithPuppeteer()
    if (result === null) {
      return
    }
    expect(typeof result).toBe('boolean')
  })

  it('firefox event options probe (optional)', async () => {
    if (!isBrowserMatrixEnabled() || !shouldRunBrowser('firefox')) {
      return
    }
    const result = await probeEventOptionsWithPlaywright('firefox')
    if (result === null) {
      return
    }
    expect(typeof result).toBe('boolean')
  })

  it('webkit event options probe (optional)', async () => {
    if (!isBrowserMatrixEnabled() || !shouldRunBrowser('webkit')) {
      return
    }
    const result = await probeEventOptionsWithPlaywright('webkit')
    if (result === null) {
      return
    }
    expect(typeof result).toBe('boolean')
  })
})
