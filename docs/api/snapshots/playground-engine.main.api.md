# @zeus-js/playground-engine (main) API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
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
```
