import path from 'node:path'

import { parse } from '@babel/parser'

export type ZeusHmrUpdateKind =
  | 'style-only'
  | 'comment-only'
  | 'template-structure'
  | 'signal-initialization'
  | 'component-api'
  | 'unknown'

export interface ZeusHmrUpdateClassification {
  kind: ZeusHmrUpdateKind
  strategy: 'vite-style' | 'preserve-state' | 'dispose-remount'
  preserveState: boolean
}

const STYLE_FILE = /\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/i
const SIGNAL_API =
  /\b(?:createSignal|createMemo|createEffect|createRoot|onCleanup|batch|state|computed|effectScope)\s*\(/m
const COMPONENT_API =
  /\b(?:defineElement|props|emits|expose|customElements|export\s+(?:default|const|function|class))\b/m
const TEMPLATE_SYNTAX = /<\/?[A-Za-z][^>]*>|\b(?:Show|For|Host|Slot)\b/m
const DIRECTIVE_COMMENT =
  /[@#]|\b(?:webpack\w*|vite\w*|rollup\w*|sourceMappingURL|sourceURL|__PURE__|__NO_SIDE_EFFECTS__)\b/

function canonicalizeCommentBody(body: string): string {
  // Compiler/bundler directives are executable inputs, even inside comments.
  // Keep their exact contents so adding, removing, or changing one recompiles.
  if (DIRECTIVE_COMMENT.test(body)) return body

  // A LineTerminator inside a block comment participates in ASI (for example,
  // after `return`). Preserve its exact sequence, including Unicode separators.
  return '__ZEUS_HMR_COMMENT__' + body.replace(/[^\r\n\u2028\u2029]/g, '')
}

function changedLines(previousSource: string, nextSource: string): string[] {
  const previous = new Set(previousSource.split(/\r?\n/))
  const next = new Set(nextSource.split(/\r?\n/))

  return [
    ...[...previous].filter(line => !next.has(line)),
    ...[...next].filter(line => !previous.has(line)),
  ]
}

/** Normalizes only parser-identified comments, preserving all other bytes. */
function canonicalizeComments(source: string): string | undefined {
  try {
    const { comments = [] } = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      attachComment: false,
    })
    let text = ''
    let offset = 0

    for (const comment of comments ?? []) {
      const { start, end } = comment
      if (start == null || end == null) return undefined
      text += source.slice(offset, start)
      const body = canonicalizeCommentBody(comment.value)
      text += comment.type === 'CommentBlock' ? `/*${body}*/` : `//${body}`
      offset = end
    }

    return text + source.slice(offset)
  } catch {
    // Unsupported or invalid syntax must reach Vite's normal recompilation.
    return undefined
  }
}

/**
 * Classifies a source update for diagnostics and state-retention decisions.
 * Comment-only edits are the first deliberately narrow preservation contract:
 * they cannot change generated code, owner setup, listeners, or DOM bindings.
 * Every executable edit continues to use dispose-remount.
 */
export function classifyHmrUpdate(
  filename: string,
  previousSource: string | undefined,
  nextSource: string,
): ZeusHmrUpdateClassification {
  if (STYLE_FILE.test(path.extname(filename))) {
    return {
      kind: 'style-only',
      strategy: 'vite-style',
      preserveState: false,
    }
  }

  if (previousSource === undefined) {
    return {
      kind: 'unknown',
      strategy: 'dispose-remount',
      preserveState: false,
    }
  }

  const previousComments = canonicalizeComments(previousSource)
  const nextComments = canonicalizeComments(nextSource)
  if (
    previousSource !== nextSource &&
    previousComments !== undefined &&
    nextComments !== undefined &&
    previousComments === nextComments
  ) {
    return {
      kind: 'comment-only',
      strategy: 'preserve-state',
      preserveState: true,
    }
  }

  const changed = changedLines(previousSource, nextSource).join('\n')
  if (SIGNAL_API.test(changed)) {
    return {
      kind: 'signal-initialization',
      strategy: 'dispose-remount',
      preserveState: false,
    }
  }

  if (COMPONENT_API.test(changed)) {
    return {
      kind: 'component-api',
      strategy: 'dispose-remount',
      preserveState: false,
    }
  }

  if (TEMPLATE_SYNTAX.test(changed)) {
    return {
      kind: 'template-structure',
      strategy: 'dispose-remount',
      preserveState: false,
    }
  }

  return {
    kind: 'unknown',
    strategy: 'dispose-remount',
    preserveState: false,
  }
}
