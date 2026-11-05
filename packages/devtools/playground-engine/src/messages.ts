import { parseProjectSnapshot, type ProjectLimits } from './project'

import type { PlaygroundCompileResult } from './compiler'
import type { PlaygroundPreviewPayload } from './preview'

export const PLAYGROUND_CHANNEL = 'zeus-playground' as const
export const PLAYGROUND_MESSAGE_VERSION = 1 as const
export const PLAYGROUND_SANDBOX_CHANNEL = 'zeus-playground-sandbox' as const
export const PLAYGROUND_SANDBOX_MESSAGE_VERSION = 1 as const
export const MAX_PLAYGROUND_SANDBOX_MESSAGE_BYTES = 2 * 1024 * 1024

export type PlaygroundMessage =
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL
      readonly version: typeof PLAYGROUND_MESSAGE_VERSION
      readonly kind: 'compile-request'
      readonly requestId: string
      readonly snapshot: ReturnType<typeof parseProjectSnapshot>
      readonly target: 'dom' | 'ssr'
    }
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL
      readonly version: typeof PLAYGROUND_MESSAGE_VERSION
      readonly kind: 'compile-result'
      readonly requestId: string
      readonly result: PlaygroundCompileResult
    }
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL
      readonly version: typeof PLAYGROUND_MESSAGE_VERSION
      readonly kind: 'compile-error'
      readonly requestId: string
      readonly code: string
      readonly message: string
    }
  | {
      readonly channel: typeof PLAYGROUND_CHANNEL
      readonly version: typeof PLAYGROUND_MESSAGE_VERSION
      readonly kind: 'ready'
    }

interface SandboxMessageBase {
  readonly channel: typeof PLAYGROUND_SANDBOX_CHANNEL
  readonly version: typeof PLAYGROUND_SANDBOX_MESSAGE_VERSION
  readonly sessionId: string
}

export type PlaygroundSandboxMessage =
  | (SandboxMessageBase & {
      readonly kind: 'sandbox-ready'
      readonly capabilities: {
        readonly opaqueOrigin: boolean
        readonly modules: boolean
      }
    })
  | (SandboxMessageBase & {
      readonly kind: 'sandbox-load'
      readonly requestId: string
      readonly timeoutMs: number
      readonly payload: PlaygroundPreviewPayload
    })
  | (SandboxMessageBase & {
      readonly kind: 'sandbox-result'
      readonly requestId: string
      readonly status: 'ready'
      readonly durationMs: number
      readonly exportedNames: readonly string[]
      readonly devtools?: PlaygroundSandboxDevtools
    })
  | (SandboxMessageBase & {
      readonly kind: 'sandbox-error'
      readonly requestId: string
      readonly code: string
      readonly message: string
    })
  | (SandboxMessageBase & {
      readonly kind: 'sandbox-stop'
      readonly requestId: string
    })
  | (SandboxMessageBase & {
      readonly kind: 'sandbox-host-preview'
      readonly requestId: string
      readonly tag: string
    })
  | (SandboxMessageBase & {
      readonly kind: 'sandbox-host-result'
      readonly requestId: string
      readonly react: boolean
      readonly vue: boolean
    })

export interface PlaygroundSandboxDevtools {
  readonly mode: 'runtime' | 'structural'
  readonly eventCount: number
  readonly ownerCount: number
  readonly componentCount: number
  readonly bindingCount: number
  readonly effectCount: number
  readonly sourceCount: number
  readonly customElementCount: number
  readonly domNodeCount: number
  readonly textNodeCount: number
  readonly elementCount: number
  readonly timeline: readonly {
    readonly id: number
    readonly timestamp: number
    readonly type: string
    readonly reason?: string
    readonly name?: string
  }[]
}

export function parsePlaygroundMessage(
  value: unknown,
  limits?: Partial<ProjectLimits>,
): PlaygroundMessage | undefined {
  if (!isRecord(value)) return undefined
  if (
    value.channel !== PLAYGROUND_CHANNEL ||
    value.version !== PLAYGROUND_MESSAGE_VERSION ||
    typeof value.kind !== 'string'
  ) {
    return undefined
  }
  if (value.kind === 'ready') {
    return {
      channel: PLAYGROUND_CHANNEL,
      version: PLAYGROUND_MESSAGE_VERSION,
      kind: 'ready',
    }
  }
  if (!isToken(value.requestId)) return undefined
  if (value.kind === 'compile-request') {
    if (value.target !== 'dom' && value.target !== 'ssr') return undefined
    try {
      return {
        channel: PLAYGROUND_CHANNEL,
        version: PLAYGROUND_MESSAGE_VERSION,
        kind: 'compile-request',
        requestId: value.requestId,
        target: value.target,
        snapshot: parseProjectSnapshot(value.snapshot, limits),
      }
    } catch {
      return undefined
    }
  }
  if (value.kind === 'compile-error') {
    if (
      typeof value.code !== 'string' ||
      typeof value.message !== 'string' ||
      value.code.length > 128 ||
      value.message.length > 8_192
    ) {
      return undefined
    }
    return {
      channel: PLAYGROUND_CHANNEL,
      version: PLAYGROUND_MESSAGE_VERSION,
      kind: 'compile-error',
      requestId: value.requestId,
      code: value.code,
      message: value.message,
    }
  }
  if (value.kind === 'compile-result' && isCompileResult(value.result)) {
    return {
      channel: PLAYGROUND_CHANNEL,
      version: PLAYGROUND_MESSAGE_VERSION,
      kind: 'compile-result',
      requestId: value.requestId,
      result: value.result,
    }
  }
  return undefined
}

export function parseSandboxMessage(
  value: unknown,
  maxBytes = MAX_PLAYGROUND_SANDBOX_MESSAGE_BYTES,
): PlaygroundSandboxMessage | undefined {
  const actualBytes = serializedByteLength(value)
  if (actualBytes === undefined || actualBytes > maxBytes) return undefined
  if (!isRecord(value)) return undefined
  if (
    value.channel !== PLAYGROUND_SANDBOX_CHANNEL ||
    value.version !== PLAYGROUND_SANDBOX_MESSAGE_VERSION ||
    typeof value.kind !== 'string' ||
    !isToken(value.sessionId)
  ) {
    return undefined
  }
  const base = {
    channel: PLAYGROUND_SANDBOX_CHANNEL,
    version: PLAYGROUND_SANDBOX_MESSAGE_VERSION,
    sessionId: value.sessionId,
  } as const

  if (value.kind === 'sandbox-ready') {
    if (
      !isRecord(value.capabilities) ||
      typeof value.capabilities.opaqueOrigin !== 'boolean' ||
      value.capabilities.modules !== true
    ) {
      return undefined
    }
    return {
      ...base,
      kind: 'sandbox-ready',
      capabilities: {
        opaqueOrigin: value.capabilities.opaqueOrigin,
        modules: true,
      },
    }
  }

  if (!isToken(value.requestId)) return undefined
  if (value.kind === 'sandbox-load') {
    if (
      !isSafePositiveInteger(value.timeoutMs, 10_000) ||
      !isPreviewPayload(value.payload)
    ) {
      return undefined
    }
    return {
      ...base,
      kind: 'sandbox-load',
      requestId: value.requestId,
      timeoutMs: value.timeoutMs,
      payload: value.payload,
    }
  }
  if (value.kind === 'sandbox-result') {
    if (
      value.status !== 'ready' ||
      !isFiniteNonNegative(value.durationMs) ||
      !Array.isArray(value.exportedNames) ||
      !value.exportedNames.every(
        name => typeof name === 'string' && name.length <= 128,
      ) ||
      (value.devtools !== undefined && !isDevtools(value.devtools))
    ) {
      return undefined
    }
    return {
      ...base,
      kind: 'sandbox-result',
      requestId: value.requestId,
      status: 'ready',
      durationMs: value.durationMs,
      exportedNames: Object.freeze([...value.exportedNames]),
      ...(value.devtools === undefined
        ? {}
        : { devtools: value.devtools as PlaygroundSandboxDevtools }),
    }
  }
  if (value.kind === 'sandbox-error') {
    if (
      typeof value.code !== 'string' ||
      typeof value.message !== 'string' ||
      value.code.length === 0 ||
      value.code.length > 128 ||
      value.message.length > 8_192
    ) {
      return undefined
    }
    return {
      ...base,
      kind: 'sandbox-error',
      requestId: value.requestId,
      code: value.code,
      message: value.message,
    }
  }
  if (value.kind === 'sandbox-stop') {
    return {
      ...base,
      kind: 'sandbox-stop',
      requestId: value.requestId,
    }
  }
  if (value.kind === 'sandbox-host-preview') {
    if (
      typeof value.tag !== 'string' ||
      !/^[a-z][a-z0-9]*-[a-z0-9-]+$/.test(value.tag)
    ) {
      return undefined
    }
    return {
      ...base,
      kind: 'sandbox-host-preview',
      requestId: value.requestId,
      tag: value.tag,
    }
  }
  if (value.kind === 'sandbox-host-result') {
    if (typeof value.react !== 'boolean' || typeof value.vue !== 'boolean') {
      return undefined
    }
    return {
      ...base,
      kind: 'sandbox-host-result',
      requestId: value.requestId,
      react: value.react,
      vue: value.vue,
    }
  }
  return undefined
}

/**
 * Sandboxes always report `"null"` for cross-document messages because they
 * intentionally omit `allow-same-origin`.
 */
export function isOpaqueSandboxOrigin(origin: string): boolean {
  return origin === 'null'
}

function isPreviewPayload(value: unknown): value is PlaygroundPreviewPayload {
  if (
    !isRecord(value) ||
    typeof value.entryPath !== 'string' ||
    !Array.isArray(value.modules) ||
    !Array.isArray(value.styles) ||
    !Array.isArray(value.runtimeModules) ||
    value.modules.length === 0 ||
    value.modules.length > 64 ||
    value.styles.length > 64 ||
    value.runtimeModules.length > 32
  ) {
    return false
  }
  const paths = new Set<string>()
  for (const module of value.modules) {
    if (
      !isRecord(module) ||
      typeof module.path !== 'string' ||
      typeof module.code !== 'string' ||
      !Array.isArray(module.imports) ||
      !module.imports.every(dependency => typeof dependency === 'string')
    ) {
      return false
    }
    if (paths.has(module.path)) return false
    paths.add(module.path)
  }
  if (!paths.has(value.entryPath)) return false
  return value.modules.every(module => {
    const imports = module.imports as unknown[]
    return imports.every(
      dependency => typeof dependency === 'string' && paths.has(dependency),
    )
  })
}

function isDevtools(value: unknown): value is PlaygroundSandboxDevtools {
  if (
    !isRecord(value) ||
    !isFiniteNonNegative(value.eventCount) ||
    (value.mode !== 'runtime' && value.mode !== 'structural') ||
    !isCount(value.ownerCount) ||
    !isCount(value.componentCount) ||
    !isCount(value.bindingCount) ||
    !isCount(value.effectCount) ||
    !isCount(value.sourceCount) ||
    !isCount(value.customElementCount) ||
    !isCount(value.domNodeCount) ||
    !isCount(value.textNodeCount) ||
    !isCount(value.elementCount) ||
    !Array.isArray(value.timeline) ||
    value.timeline.length > 64
  ) {
    return false
  }
  return value.timeline.every(
    entry =>
      isRecord(entry) &&
      isSafeNonNegativeInteger(entry.id) &&
      isFiniteNonNegative(entry.timestamp) &&
      typeof entry.type === 'string' &&
      entry.type.length > 0 &&
      entry.type.length <= 64 &&
      (entry.reason === undefined ||
        (typeof entry.reason === 'string' && entry.reason.length <= 128)) &&
      (entry.name === undefined ||
        (typeof entry.name === 'string' && entry.name.length <= 128)),
  )
}

function isCount(value: unknown): value is number {
  return isSafeNonNegativeInteger(value)
}

function isSafeNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isCompileResult(value: unknown): value is PlaygroundCompileResult {
  return (
    isRecord(value) &&
    (value.target === 'dom' || value.target === 'ssr') &&
    typeof value.entryPath === 'string' &&
    typeof value.compilerVersion === 'string' &&
    Array.isArray(value.modules) &&
    value.modules.every(
      module =>
        isRecord(module) &&
        typeof module.path === 'string' &&
        typeof module.code === 'string' &&
        Array.isArray(module.diagnostics) &&
        Array.isArray(module.imports),
    ) &&
    Array.isArray(value.styles) &&
    Array.isArray(value.diagnostics) &&
    isRecord(value.meta)
  )
}

function isToken(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._:-]+$/.test(value)
  )
}

function isSafePositiveInteger(value: unknown, max: number): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 250 &&
    value <= max
  )
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function serializedByteLength(value: unknown): number | undefined {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
