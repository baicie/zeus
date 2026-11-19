import type { ZeusRouter } from './types'
import type { FutureConfig, Router as RemixRouter } from '@remix-run/router'

interface RouterRecord {
  engine: RemixRouter
  basename: string
  future: FutureConfig
}

const records = new WeakMap<ZeusRouter, RouterRecord>()

/** @internal */
export function registerEngine(
  router: ZeusRouter,
  engine: RemixRouter,
  future: FutureConfig,
  basename = '/',
): void {
  records.set(router, { engine, basename, future })
}

function getRecord(router: ZeusRouter): RouterRecord {
  const record = records.get(router)

  if (!record) {
    throw new Error(
      '[Zeus router] This router was not created by createRouter(); the router engine is unavailable.',
    )
  }

  return record
}

/** @internal */
export function getEngine(router: ZeusRouter): RemixRouter {
  return getRecord(router).engine
}

/** @internal */
export function getEngineInfo(router: ZeusRouter): RouterRecord {
  return getRecord(router)
}

/** Options accepted by the internal fetcher gateway. */
export interface EngineFetchOptions {
  relative?: 'route' | 'path'
  preventScrollReset?: boolean
  flushSync?: boolean
  formMethod?: string
  formData?: FormData
  body?: unknown
}

/** Internal facade over the router engine used by fetchers and preloads. */
export interface EngineGateway {
  fetch(
    key: string,
    routeId: string,
    href: string,
    options?: EngineFetchOptions,
  ): void
  deleteFetcher(key: string): void
}

/** @internal */
export function getGateway(router: ZeusRouter): EngineGateway {
  const engine = getEngine(router)

  return {
    fetch: (key, routeId, href, options) =>
      engine.fetch(
        key,
        routeId,
        href,
        options as Parameters<RemixRouter['fetch']>[3],
      ),
    deleteFetcher: key => engine.deleteFetcher(key),
  }
}
