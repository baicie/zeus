import { RuntimeDiagnosticsField } from './constants'

export interface RuntimeDiagnosticsSnapshot {
  effectsCreated: number
  effectsDisposed: number
  proxiesCreated: number
  scopesCreated: number
  scopesDisposed: number
  refsCreated: number
  memosCreated: number
  allocationsCreated: number
  allocationsDisposed: number
}

export interface RuntimeDiagnosticsSession {
  run<T extends () => unknown>(fn: SynchronousCallback<T>): ReturnType<T>
  snapshot(): Readonly<RuntimeDiagnosticsSnapshot>
  dispose(): void
}

type SynchronousCallback<T extends () => unknown> = T &
  (Extract<ReturnType<T>, PromiseLike<unknown>> extends never ? unknown : never)

export interface RuntimeDiagnosticsScopeRun {
  <T>(fn: () => T): T | undefined
}

export type RuntimeDiagnosticsCollector = [
  active: boolean,
  effectsCreated: number,
  effectsDisposed: number,
  proxiesCreated: number,
  scopesCreated: number,
  scopesDisposed: number,
  refsCreated: number,
  memosCreated: number,
  wrapEffect: <T>(run: () => T) => () => T,
  wrapScope: (run: RuntimeDiagnosticsScopeRun) => RuntimeDiagnosticsScopeRun,
]

export let activeRuntimeDiagnostics: RuntimeDiagnosticsCollector | undefined

function runWithRuntimeDiagnostics<T>(
  diagnostics: RuntimeDiagnosticsCollector | undefined,
  fn: () => T,
): T {
  if (!diagnostics?.[RuntimeDiagnosticsField.ACTIVE]) return fn()

  const previous = activeRuntimeDiagnostics
  activeRuntimeDiagnostics = diagnostics
  try {
    return fn()
  } finally {
    activeRuntimeDiagnostics = previous?.[RuntimeDiagnosticsField.ACTIVE]
      ? previous
      : undefined
  }
}

export function createRuntimeDiagnosticsSession(): RuntimeDiagnosticsSession {
  const diagnostics: RuntimeDiagnosticsCollector = [
    true,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
    run => () => runWithRuntimeDiagnostics(diagnostics, run),
    run => fn => runWithRuntimeDiagnostics(diagnostics, () => run(fn)),
  ]

  return {
    run<T extends () => unknown>(fn: SynchronousCallback<T>): ReturnType<T> {
      return runWithRuntimeDiagnostics(diagnostics, fn) as ReturnType<T>
    },
    snapshot(): Readonly<RuntimeDiagnosticsSnapshot> {
      const allocationsCreated =
        diagnostics[RuntimeDiagnosticsField.EFFECTS_CREATED] +
        diagnostics[RuntimeDiagnosticsField.PROXIES_CREATED] +
        diagnostics[RuntimeDiagnosticsField.SCOPES_CREATED] +
        diagnostics[RuntimeDiagnosticsField.REFS_CREATED] +
        diagnostics[RuntimeDiagnosticsField.MEMOS_CREATED]
      const allocationsDisposed =
        diagnostics[RuntimeDiagnosticsField.EFFECTS_DISPOSED] +
        diagnostics[RuntimeDiagnosticsField.SCOPES_DISPOSED]

      return {
        effectsCreated: diagnostics[RuntimeDiagnosticsField.EFFECTS_CREATED],
        effectsDisposed: diagnostics[RuntimeDiagnosticsField.EFFECTS_DISPOSED],
        proxiesCreated: diagnostics[RuntimeDiagnosticsField.PROXIES_CREATED],
        scopesCreated: diagnostics[RuntimeDiagnosticsField.SCOPES_CREATED],
        scopesDisposed: diagnostics[RuntimeDiagnosticsField.SCOPES_DISPOSED],
        refsCreated: diagnostics[RuntimeDiagnosticsField.REFS_CREATED],
        memosCreated: diagnostics[RuntimeDiagnosticsField.MEMOS_CREATED],
        allocationsCreated,
        allocationsDisposed,
      }
    },
    dispose(): void {
      diagnostics[RuntimeDiagnosticsField.ACTIVE] = false
      if (activeRuntimeDiagnostics === diagnostics) {
        activeRuntimeDiagnostics = undefined
      }
    },
  }
}
