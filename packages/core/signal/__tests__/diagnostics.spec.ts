import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import ts from 'typescript'
import { describe, expect, it } from 'vitest'

import { createRuntimeDiagnosticsSession } from '../src/diagnostics'
import {
  computed,
  effect,
  effectScope,
  onScopeDispose,
  stop,
} from '../src/internal'
import { reactive } from '../src/reactive'
import { ref } from '../src/ref'

describe('runtime diagnostics', () => {
  it('keeps effect and scope wrappers off the inactive fast path', () => {
    const runner = effect(() => undefined)
    const scope = effectScope(true)

    expect(Object.prototype.hasOwnProperty.call(runner.effect, 'run')).toBe(
      false,
    )
    expect(Object.prototype.hasOwnProperty.call(runner.effect, 'stop')).toBe(
      false,
    )
    expect(Object.prototype.hasOwnProperty.call(scope, 'run')).toBe(false)
    expect(Object.prototype.hasOwnProperty.call(scope, 'stop')).toBe(false)

    stop(runner)
    scope.stop()
  })

  it('counts runtime-owned allocations and idempotent disposal', () => {
    const diagnostics = createRuntimeDiagnosticsSession()
    let disposeResources!: () => void

    diagnostics.run(() => {
      const scope = effectScope(true)
      scope.run(() => {
        const source = ref(1)
        const memo = computed(() => source.value * 2)
        const runner = effect(() => memo.value)

        disposeResources = () => {
          stop(runner)
          stop(runner)
          scope.stop()
          scope.stop()
        }
      })
    })

    expect(diagnostics.snapshot()).toEqual({
      effectsCreated: 1,
      effectsDisposed: 0,
      proxiesCreated: 0,
      scopesCreated: 1,
      scopesDisposed: 0,
      refsCreated: 1,
      memosCreated: 1,
      allocationsCreated: 4,
      allocationsDisposed: 0,
    })

    disposeResources()

    expect(diagnostics.snapshot()).toEqual({
      effectsCreated: 1,
      effectsDisposed: 1,
      proxiesCreated: 0,
      scopesCreated: 1,
      scopesDisposed: 1,
      refsCreated: 1,
      memosCreated: 1,
      allocationsCreated: 4,
      allocationsDisposed: 2,
    })
  })

  it('counts a proxy only for a cache miss', () => {
    const diagnostics = createRuntimeDiagnosticsSession()
    const raw = { value: 1 }

    diagnostics.run(() => {
      expect(reactive(raw)).toBe(reactive(raw))
    })

    expect(diagnostics.snapshot().proxiesCreated).toBe(1)
  })

  it('disposes an effect whose initial execution throws', () => {
    const diagnostics = createRuntimeDiagnosticsSession()

    expect(() =>
      diagnostics.run(() => {
        effect(() => {
          throw new Error('expected')
        })
      }),
    ).toThrow('expected')

    const snapshot = diagnostics.snapshot()
    expect(snapshot.effectsCreated).toBe(1)
    expect(snapshot.effectsDisposed).toBe(1)
  })

  it('attributes delayed allocations to the effect creation session', () => {
    const diagnostics = createRuntimeDiagnosticsSession()
    const raw = { value: 1 }
    let enabled!: ReturnType<typeof ref<boolean>>

    diagnostics.run(() => {
      enabled = ref(false)
      effect(() => {
        if (enabled.value) reactive(raw)
      })
    })

    enabled.value = true

    expect(diagnostics.snapshot().proxiesCreated).toBe(1)
  })

  it('restores a surrounding session after delayed effect attribution', () => {
    const first = createRuntimeDiagnosticsSession()
    const second = createRuntimeDiagnosticsSession()
    const raw = { value: 1 }
    let enabled!: ReturnType<typeof ref<boolean>>
    let runner!: ReturnType<typeof effect>

    first.run(() => {
      enabled = ref(false)
      runner = effect(() => {
        if (enabled.value) reactive(raw)
      })
    })

    second.run(() => {
      enabled.value = true
      ref(2)
    })
    stop(runner)

    expect(first.snapshot().proxiesCreated).toBe(1)
    expect(first.snapshot().refsCreated).toBe(1)
    expect(second.snapshot().proxiesCreated).toBe(0)
    expect(second.snapshot().refsCreated).toBe(1)
  })

  it('inherits attribution through later nested and detached scope runs', () => {
    const diagnostics = createRuntimeDiagnosticsSession()
    let parent!: ReturnType<typeof effectScope>

    diagnostics.run(() => {
      parent = effectScope(true)
    })

    parent.run(() => {
      const child = effectScope(true)
      child.run(() => effect(() => undefined))
      child.stop()
    })
    parent.stop()

    const snapshot = diagnostics.snapshot()
    expect(snapshot.scopesCreated).toBe(2)
    expect(snapshot.scopesDisposed).toBe(2)
    expect(snapshot.effectsCreated).toBe(1)
    expect(snapshot.effectsDisposed).toBe(1)
  })

  it('counts a scope once when its cleanup throws', () => {
    const diagnostics = createRuntimeDiagnosticsSession()
    let scope!: ReturnType<typeof effectScope>

    diagnostics.run(() => {
      scope = effectScope(true)
      scope.run(() => {
        onScopeDispose(() => {
          throw new Error('expected cleanup failure')
        })
      })
    })

    expect(() => scope.stop()).toThrow('expected cleanup failure')
    expect(diagnostics.snapshot().scopesDisposed).toBe(1)

    expect(() => scope.stop()).not.toThrow()
    expect(diagnostics.snapshot().scopesDisposed).toBe(1)
  })

  it('isolates sessions and stops collecting after disposal', () => {
    const first = createRuntimeDiagnosticsSession()
    const second = createRuntimeDiagnosticsSession()
    let runner!: ReturnType<typeof effect>

    first.run(() => {
      ref(1)
      runner = effect(() => undefined)
    })
    second.run(() => ref(2))
    first.dispose()
    first.run(() => ref(3))
    stop(runner)

    expect(first.snapshot().refsCreated).toBe(1)
    expect(first.snapshot().effectsCreated).toBe(1)
    expect(first.snapshot().effectsDisposed).toBe(0)
    expect(second.snapshot().refsCreated).toBe(1)
  })

  it('stops collecting immediately when disposed inside run', () => {
    const diagnostics = createRuntimeDiagnosticsSession()

    diagnostics.run(() => {
      ref(1)
      diagnostics.dispose()
      ref(2)
    })

    expect(diagnostics.snapshot().refsCreated).toBe(1)
  })

  it('rejects any possibly async callback without degrading sync inference', async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), 'zeus-runtime-diagnostics-types-'),
    )
    const consumerPath = path.join(root, 'consumer.ts')
    const diagnosticsSourcePath = fileURLToPath(
      new URL('../src/runtime-diagnostics.ts', import.meta.url),
    )
    const diagnosticsImport = toModuleSpecifier(
      path.relative(root, diagnosticsSourcePath),
    )

    await fs.writeFile(
      consumerPath,
      `
        import type { RuntimeDiagnosticsSession } from ${JSON.stringify(diagnosticsImport)}

        declare const diagnostics: RuntimeDiagnosticsSession
        diagnostics.run(() => Promise.resolve())

        declare const possiblyAsync: () => void | PromiseLike<void>
        diagnostics.run(possiblyAsync)

        const syncResult = diagnostics.run(() => ({ value: 1 as const }))
        const exactSyncResult: { value: 1 } = syncResult
      `,
    )

    const program = ts.createProgram([consumerPath], {
      allowImportingTsExtensions: true,
      lib: ['lib.es2016.d.ts'],
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      skipLibCheck: false,
      strict: true,
      target: ts.ScriptTarget.ES2016,
      types: [],
    })
    const diagnostics = ts
      .getPreEmitDiagnostics(program)
      .filter(diagnostic => diagnostic.file?.fileName === consumerPath)
    const messages = diagnostics.map(diagnostic =>
      ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'),
    )

    expect(messages).toHaveLength(2)
    expect(messages.every(message => message.includes('Promise'))).toBe(true)
  })
})

function toModuleSpecifier(relativePath: string): string {
  const normalized = relativePath.split(path.sep).join('/')
  return normalized.startsWith('.') ? normalized : `./${normalized}`
}
