import type { CompilerErrorCode } from './codes'
import type { SourceLocation } from '@babel/types'

type ErrorPath = {
  node: {
    loc?: SourceLocation | null
  }
}

export type CompilerErrorOptions = {
  code: CompilerErrorCode
  message: string
  path?: ErrorPath
  hint?: string
}

export class CompilerError extends Error {
  code: CompilerErrorCode
  hint?: string

  constructor(options: CompilerErrorOptions) {
    const loc = options.path?.node.loc?.start
    const location = loc ? ` (${loc.line}:${loc.column})` : ''
    const hint = options.hint ? `\nHint: ${options.hint}` : ''

    super(`[${options.code}] ${options.message}${location}${hint}`)

    this.name = 'ZeusCompilerError'
    this.code = options.code
    this.hint = options.hint
  }
}
