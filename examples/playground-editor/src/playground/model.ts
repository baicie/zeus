import type { PlaygroundProduct } from '../products'
import type { MessageKey } from './i18n'

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

/**
 * Titles and descriptions are message keys, never literal copy, so the whole
 * shell can switch language without reloading persisted state.
 */
export interface PlaygroundExample {
  readonly id: string
  readonly product: PlaygroundProduct
  readonly titleKey: MessageKey
  readonly descriptionKey: MessageKey
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
