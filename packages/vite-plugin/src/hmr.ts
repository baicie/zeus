// Hot Module Replacement for Zeus

import type { HMRPayload } from 'vite'
import type { ModuleNode } from 'vite'
import type { ViteDevServer } from 'vite'

export interface HMRContext {
  server: ViteDevServer
  file: string
  timestamp: number
}

export function handleHMR(
  ctx: { file: string; modules: Set<ModuleNode>; read: () => string | Promise<string>; server: ViteDevServer },
  compiler: any
): void {
  const { server, file, modules } = ctx

  // Notify clients about the update
  server.ws.send({
    type: 'update',
    updates: [{
      type: 'js-update',
      timestamp: Date.now(),
      // Vite will handle the actual update
    }],
  })

  // Invalidate modules that depend on this file
  for (const mod of modules) {
    server.moduleGraph.invalidateModule(mod, undefined, server.timestamp)
  }
}

export function notifyHMR(
  server: ViteDevServer,
  payload: HMRPayload
): void {
  server.ws.send(payload)
}

export function createHMRBoundary(file: string): string {
  return `/* HMR: ${file} */`
}

export function isHMREnabled(): boolean {
  return typeof import.meta.hot !== 'undefined'
}
