import { type QueryClient } from '@tanstack/query-core'

import type { ZeusQueryClient } from './types'

const engines = new WeakMap<ZeusQueryClient, QueryClient>()

/** @internal Registers the query-core client behind a Zeus client handle. */
export function attachEngine(
  client: ZeusQueryClient,
  engine: QueryClient,
): void {
  engines.set(client, engine)
}

/** @internal Resolves the query-core client; throws for foreign handles. */
export function getEngine(client: ZeusQueryClient): QueryClient {
  const engine = engines.get(client)

  if (!engine) {
    throw new Error(
      '[Zeus query] This query client was not created by createQueryClient(); the cache engine is unavailable.',
    )
  }

  return engine
}
