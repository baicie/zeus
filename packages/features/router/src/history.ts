import {
  createBrowserHistory as createRemixBrowserHistory,
  createMemoryHistory as createRemixMemoryHistory,
} from '@remix-run/router'

import type {
  ZeusBrowserHistoryOptions,
  ZeusHistory,
  ZeusMemoryHistoryOptions,
} from './types'

/** Creates a history backed by the browser URL and session history. */
export function createBrowserHistory(
  options: ZeusBrowserHistoryOptions = {},
): ZeusHistory {
  return createRemixBrowserHistory(options) as ZeusHistory
}

/** Creates an in-memory history for SSR, tests, and embedded applications. */
export function createMemoryHistory(
  options: ZeusMemoryHistoryOptions = {},
): ZeusHistory {
  return createRemixMemoryHistory(options) as ZeusHistory
}
