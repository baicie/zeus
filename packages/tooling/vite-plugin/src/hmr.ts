import { parse } from '@babel/parser'

export type ZeusHmrUpdateKind =
  | 'style-only'
  | 'comment-only'
  | 'template-structure'
  | 'signal-initialization'
  | 'component-api'
  | 'unknown'

export interface ZeusHmrUpdateClassification {
  readonly kind: ZeusHmrUpdateKind
  readonly strategy: 'vite-style' | 'preserve-state' | 'dispose-remount'
  readonly preserveState: boolean
}

const SIGNAL_API =
  /\b(?:createSignal|createMemo|createEffect|createRoot|onCleanup|batch|state|computed|effectScope)\s*\(/m
const COMPONENT_API =
  /\b(?:defineElement|props|emits|expose|customElements|export\s+(?:default|const|function|class))\b/m
const TEMPLATE_SYNTAX = /<\/?[A-Za-z][^>]*>|\b(?:Show|For|Host|Slot)\b/m
const STYLE_EXTENSION = /\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/i
const DIRECTIVE_COMMENT =
  /[@#]|\b(?:webpack\w*|vite\w*|rollup\w*|sourceMappingURL|sourceURL|__PURE__|__NO_SIDE_EFFECTS__)\b/

/**
 * Classifies a source update for the Vite plugin's narrow preservation
 * contract and Playground diagnostics. It never decides that executable edits keep state: only
 * comment-only changes can preserve the module instance.
 */
export function classifyHmrUpdate(
  filename: string,
  previousSource: string | undefined,
  nextSource: string,
): ZeusHmrUpdateClassification {
  if (STYLE_EXTENSION.test(filename)) {
    return {
      kind: 'style-only',
      strategy: 'vite-style',
      preserveState: false,
    }
  }
  if (previousSource === undefined || previousSource === nextSource) {
    return {
      kind: 'unknown',
      strategy: 'dispose-remount',
      preserveState: false,
    }
  }

  const previous = analyzeSource(previousSource)
  const next = analyzeSource(nextSource)
  if (
    previous !== undefined &&
    next !== undefined &&
    previous.comments === next.comments
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
  if (
    TEMPLATE_SYNTAX.test(changed) ||
    (previous !== undefined &&
      next !== undefined &&
      changedLineNumbers(previousSource, nextSource).some(
        line => previous.jsxLines.has(line) || next.jsxLines.has(line),
      ))
  ) {
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

function changedLines(previousSource: string, nextSource: string): string[] {
  const previous = new Set(previousSource.split(/\r?\n/))
  const next = new Set(nextSource.split(/\r?\n/))
  return [
    ...[...previous].filter(line => !next.has(line)),
    ...[...next].filter(line => !previous.has(line)),
  ]
}

interface ParsedSource {
  readonly comments: string
  readonly jsxLines: Set<number>
}

/** Parse once, then derive both comment normalization and JSX line ranges. */
function analyzeSource(source: string): ParsedSource | undefined {
  try {
    const file = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      attachComment: false,
    })
    const jsxLines = new Set<number>()
    const stack: unknown[] = [file.program]
    while (stack.length > 0) {
      const value = stack.pop()
      if (Array.isArray(value)) {
        for (const child of value) stack.push(child)
        continue
      }
      if (!isSyntaxNode(value)) continue
      if (
        value.type.startsWith('JSX') &&
        value.start != null &&
        value.end != null
      ) {
        const startLine = lineAt(source, value.start)
        const endLine = lineAt(source, value.end)
        for (let line = startLine; line <= endLine; line += 1) {
          jsxLines.add(line)
        }
      }
      for (const [key, child] of Object.entries(value)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue
        if (Array.isArray(child) || isSyntaxNode(child)) stack.push(child)
      }
    }

    let comments = ''
    let offset = 0
    for (const comment of file.comments ?? []) {
      if (comment.start == null || comment.end == null) continue
      comments += source.slice(offset, comment.start)
      const body = DIRECTIVE_COMMENT.test(comment.value)
        ? comment.value
        : '__ZEUS_HMR_COMMENT__' +
          comment.value.replace(/[^\r\n\u2028\u2029]/g, '')
      comments += comment.type === 'CommentBlock' ? `/*${body}*/` : `//${body}`
      offset = comment.end
    }
    comments += source.slice(offset)

    return { comments, jsxLines }
  } catch {
    return undefined
  }
}

function changedLineNumbers(
  previousSource: string,
  nextSource: string,
): number[] {
  const previous = previousSource.split(/\r?\n/)
  const next = nextSource.split(/\r?\n/)
  const previousSet = new Set(previous)
  const nextSet = new Set(next)
  const changed: number[] = []
  for (
    let index = 0;
    index < Math.max(previous.length, next.length);
    index += 1
  ) {
    if (
      (previous[index] !== undefined && !nextSet.has(previous[index]!)) ||
      (next[index] !== undefined && !previousSet.has(next[index]!))
    ) {
      changed.push(index + 1)
    }
  }
  return changed
}

function lineAt(source: string, offset: number): number {
  let line = 1
  const end = Math.min(offset, source.length)
  for (let index = 0; index < end; index += 1) {
    if (source.charCodeAt(index) === 10) line += 1
  }
  return line
}

interface SyntaxNode {
  readonly type?: unknown
  readonly start?: unknown
  readonly end?: unknown
  readonly [key: string]: unknown
}

function isSyntaxNode(value: unknown): value is SyntaxNode & {
  type: string
  start: number | null
  end: number | null
} {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}
