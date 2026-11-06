import type { PlaygroundProduct } from '../products'

export type { PlaygroundProduct }

export interface PlaygroundFile {
  readonly path: string
  readonly content: string
}

export interface PlaygroundWorkspace {
  readonly product: PlaygroundProduct
  readonly files: readonly PlaygroundFile[]
  readonly activePath: string
  readonly exampleId?: string
}

export interface PlaygroundExample {
  readonly id: string
  readonly product: PlaygroundProduct
  readonly title: string
  readonly description: string
  readonly files: readonly PlaygroundFile[]
}

export interface ConsoleEntry {
  readonly id: number
  readonly level: 'log' | 'info' | 'warn' | 'error'
  readonly message: string
  readonly timestamp: number
}

export interface DiagnosticItem {
  readonly id: string
  readonly file: string
  readonly severity: 'error' | 'warning'
  readonly code: string
  readonly message: string
  readonly hint?: string
  readonly line?: number
  readonly column?: number
}

export interface OutputTab {
  readonly id:
    | 'preview'
    | 'output'
    | 'console'
    | 'problems'
    | 'inspector'
    | 'devtools'
  readonly label: string
}

export interface PersistedWorkspace extends PlaygroundWorkspace {
  readonly schemaVersion: 1
  readonly savedAt: string
}
