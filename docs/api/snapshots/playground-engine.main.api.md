# @zeus-js/playground-engine (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
import { ComponentManifest } from '@zeus-js/component-analyzer'

export interface PlaygroundModuleImport {
  readonly specifier: string
  readonly kind: 'dynamic-import' | 'export' | 'import'
  readonly typeOnly: boolean
  readonly start: number
  readonly end: number
}
/**
 * Reads the static and literal dynamic ESM edges the playground can mirror in
 * its browser sandbox. Non-literal dynamic imports are not resolvable.
 */
export declare function analyzeModuleImports(
  source: string,
): PlaygroundModuleImport[]

export declare const PROJECT_SNAPSHOT_VERSION: 2
export type ProjectLanguage = 'css' | 'json' | 'ts' | 'tsx'
export type ProjectFrameworkTarget = 'native' | 'webc'
export interface ProjectFile {
  readonly path: string
  readonly content: string
  readonly language: ProjectLanguage
}
export interface ProjectDependency {
  readonly name: string
  readonly version: string
}
export interface ProjectOptions {
  readonly delegateEvents: boolean
  readonly sourceMap: boolean
  readonly sandboxTimeoutMs: number
}
export interface ProjectSnapshot {
  readonly schemaVersion: typeof PROJECT_SNAPSHOT_VERSION
  readonly entryPath: string
  readonly files: readonly ProjectFile[]
  readonly frameworkTarget: ProjectFrameworkTarget
  readonly compilerVersion: string
  readonly dependencies: readonly ProjectDependency[]
  readonly options: ProjectOptions
}
export interface ProjectLimits {
  readonly maxFiles: number
  readonly maxFileBytes: number
  readonly maxProjectBytes: number
  readonly maxDependencies: number
  readonly maxSandboxTimeoutMs: number
}
export interface ProjectIssue {
  readonly code: string
  readonly message: string
  readonly path?: string
}
export declare const DEFAULT_PROJECT_LIMITS: ProjectLimits
export declare class PlaygroundProjectError extends Error {
  readonly issues: readonly ProjectIssue[]
  constructor(issues: readonly ProjectIssue[])
}
export declare function parseProjectSnapshot(
  input: unknown,
  overrides?: Partial<ProjectLimits>,
): ProjectSnapshot
export declare function projectEntry(snapshot: ProjectSnapshot): ProjectFile

export type PlaygroundHmrUpdateKind =
  | 'style-only'
  | 'comment-only'
  | 'template-structure'
  | 'signal-initialization'
  | 'component-api'
  | 'unknown'
export interface PlaygroundHmrClassification {
  readonly kind: PlaygroundHmrUpdateKind
  readonly strategy: 'vite-style' | 'preserve-state' | 'dispose-remount'
  readonly preserveState: boolean
}
/**
 * Mirrors the Vite plugin's narrow preservation contract for Playground
 * diagnostics. It never decides that executable edits keep state: only
 * comment-only changes can preserve the module instance.
 */
export declare function classifyPlaygroundHmrUpdate(
  filename: string,
  previousSource: string | undefined,
  nextSource: string,
): PlaygroundHmrClassification

export interface PlaygroundCompilerDiagnostic {
  readonly code: string
  readonly message: string
  readonly severity: 'error' | 'warning'
  readonly filename: string
  readonly hint?: string
  readonly span?: unknown
  readonly source?: 'compiler' | 'project'
}
export interface PlaygroundImportEdge {
  readonly specifier: string
  readonly resolvedPath: string | null
  readonly kind: 'external' | 'json' | 'local' | 'runtime' | 'style'
  readonly typeOnly: boolean
}
export interface PlaygroundCompiledModule {
  readonly path: string
  readonly language: Extract<ProjectLanguage, 'json' | 'ts' | 'tsx'>
  readonly code: string
  readonly map: unknown | null
  readonly diagnostics: readonly PlaygroundCompilerDiagnostic[]
  readonly imports: readonly PlaygroundImportEdge[]
  readonly hmr?: PlaygroundModuleHmr
}
export interface PlaygroundHmrBinding {
  readonly id: number
  readonly kind: string
  readonly value: string
}
export interface PlaygroundHmrPlan {
  readonly version: number
  readonly signature: string
  readonly bindings: readonly PlaygroundHmrBinding[]
}
export interface PlaygroundModuleHmr {
  readonly plan: PlaygroundHmrPlan | null
  readonly initial: boolean
  readonly classification?: PlaygroundHmrClassification
}
export interface PlaygroundStyle {
  readonly path: string
  readonly content: string
}
export interface PlaygroundCompileResult {
  readonly target: 'dom' | 'ssr'
  readonly entryPath: string
  readonly compilerVersion: string
  readonly modules: readonly PlaygroundCompiledModule[]
  readonly styles: readonly PlaygroundStyle[]
  readonly diagnostics: readonly PlaygroundCompilerDiagnostic[]
  readonly meta: {
    readonly durationMs: number
    readonly moduleCount: number
    readonly byteCount: number
  }
}
export interface PlaygroundCompilerResult {
  readonly code: string
  readonly map: unknown | null
  readonly diagnostics: readonly PlaygroundCompilerDiagnostic[]
  readonly hmrPlan?: PlaygroundHmrPlan | null
}
export interface PlaygroundCompiler {
  transformModule(options: {
    source: string
    filename: string
    target: 'dom' | 'ssr'
    runtimeModule: string
    delegateEvents: boolean
    sourceMap: boolean
    hmr?: boolean
  }): Promise<PlaygroundCompilerResult>
}
export interface CompileProjectOptions {
  readonly target: 'dom' | 'ssr'
  readonly runtimeModule: string
  readonly delegateEvents?: boolean
  readonly sourceMap?: boolean
  readonly hmr?: boolean
  /** Enables HMR diagnostics against an earlier snapshot. */
  readonly previousSnapshot?: ProjectSnapshot
  readonly allowedRuntimeModules?: readonly string[]
}
export declare const DEFAULT_PLAYGROUND_RUNTIME_MODULES: readonly string[]
export declare function compileProject(
  snapshot: ProjectSnapshot,
  compiler: PlaygroundCompiler,
  options: CompileProjectOptions,
): Promise<PlaygroundCompileResult>

export interface PlaygroundPreviewModule {
  readonly path: string
  readonly code: string
  readonly imports: readonly string[]
}
export interface PlaygroundPreviewPayload {
  readonly entryPath: string
  readonly modules: readonly PlaygroundPreviewModule[]
  readonly styles: readonly {
    readonly path: string
    readonly content: string
  }[]
  readonly runtimeModules: readonly string[]
}
export interface PlaygroundPreviewOptions {
  /**
   * Maps an import specifier to the key exposed by the sandbox runtime.
   * Zeus modules default to their package specifier.
   */
  readonly runtimeModules?: Readonly<Record<string, string>>
}
export declare class PlaygroundPreviewError extends Error {
  constructor(message: string)
}
export declare function createPlaygroundPreview(
  build: PlaygroundCompileResult,
  options?: PlaygroundPreviewOptions,
): Promise<PlaygroundPreviewPayload>
export declare function previewModulePlaceholder(index: number): string

export interface PlaygroundExportFile {
  readonly path: string
  readonly content: string
}
export interface ProjectExportOptions {
  readonly packageName?: string
  readonly zeusVersion?: string
  readonly vitePluginVersion?: string
  readonly viteVersion?: string
  readonly typescriptVersion?: string
  readonly compress?: boolean
}
export interface PlaygroundExport {
  readonly packageName: string
  readonly files: readonly PlaygroundExportFile[]
  readonly fileName: string
  readonly mediaType: 'application/gzip' | 'application/x-tar'
  readonly data: Uint8Array
}
/**
 * Produces a self-contained Native app. The archive is deterministic so the
 * same project produces byte-identical evidence across repeated runs.
 */
export declare function exportProject(
  snapshot: ProjectSnapshot,
  options?: ProjectExportOptions,
): Promise<PlaygroundExport>

export declare const PLAYGROUND_CHANNEL: 'zeus-playground'
export declare const PLAYGROUND_MESSAGE_VERSION: 1
export declare const PLAYGROUND_SANDBOX_CHANNEL: 'zeus-playground-sandbox'
export declare const PLAYGROUND_SANDBOX_MESSAGE_VERSION: 1
export declare const MAX_PLAYGROUND_SANDBOX_MESSAGE_BYTES: number
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
export declare function parsePlaygroundMessage(
  value: unknown,
  limits?: Partial<ProjectLimits>,
): PlaygroundMessage | undefined
export declare function parseSandboxMessage(
  value: unknown,
  maxBytes?: number,
): PlaygroundSandboxMessage | undefined
/**
 * Sandboxes always report `"null"` for cross-document messages because they
 * intentionally omit `allow-same-origin`.
 */
export declare function isOpaqueSandboxOrigin(origin: string): boolean

export interface PlaygroundWebCBuild {
  readonly entryPath: string
  readonly metadata: PlaygroundWebCMetadata
  readonly files: readonly {
    readonly path: string
    readonly content: string
  }[]
}
/**
 * Emits the files a WebC Studio export needs and that its inspector renders:
 * the module manifest, Custom Elements Manifest view and per-tag declarations.
 */
export declare function buildWebCArtifacts(
  snapshot: ProjectSnapshot,
): PlaygroundWebCBuild
export interface PlaygroundWebCMetadata {
  readonly manifest: ComponentManifest
  readonly customElements: string
  readonly declarations: Readonly<Record<string, string>>
  readonly inspector: readonly PlaygroundComponentInspector[]
  readonly diagnostics: readonly {
    readonly code: string
    readonly message: string
    readonly filename: string
    readonly severity: 'error' | 'warning'
  }[]
}
export interface PlaygroundComponentInspector {
  readonly tag: string
  readonly shadow: boolean
  readonly formAssociated: boolean
  readonly props: readonly {
    readonly name: string
    readonly type: string
    readonly attribute: string | false
    readonly required: boolean
    readonly default: unknown
  }[]
  readonly events: readonly {
    readonly name: string
    readonly detail: Readonly<Record<string, string>>
    readonly bubbles: boolean
    readonly composed: boolean
  }[]
  readonly slots: readonly string[]
  readonly reactUsage: string
  readonly vueUsage: string
}
/**
 * Analyzes every source module in a WebC project with the same analyzer used
 * by the production output plugins. The returned manifest is the single
 * metadata source for the inspector, CEM and DTS surfaces.
 */
export declare function analyzeWebCProject(
  snapshot: ProjectSnapshot,
): PlaygroundWebCMetadata
```
