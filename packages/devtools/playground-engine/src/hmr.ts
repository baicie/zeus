import { parse } from '@babel/parser'

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

const SIGNAL_API =
  /\b(?:createSignal|createMemo|createEffect|createRoot|onCleanup|batch|state|computed|effectScope)\s*\(/m
const COMPONENT_API =
  /\b(?:defineElement|props|emits|expose|customElements|export\s+(?:default|const|function|class))\b/m
const TEMPLATE_SYNTAX = /<\/?[A-Za-z][^>]*>|\b(?:Show|For|Host|Slot)\b/m
const STYLE_EXTENSION = /\.(?:css|pcss|postcss|scss|sass|less|styl|stylus)$/i
const DIRECTIVE_COMMENT =
  /[@#]|\b(?:webpack\w*|vite\w*|rollup\w*|sourceMappingURL|sourceURL|__PURE__|__NO_SIDE_EFFECTS__)\b/

/**
 * Mirrors the Vite plugin's narrow preservation contract for Playground
 * diagnostics. It never decides that executable edits keep state: only
 * comment-only changes can preserve the module instance.
 */
export function classifyPlaygroundHmrUpdate(
  filename: string,
  previousSource: string | undefined,
  nextSource: string,
): PlaygroundHmrClassification {
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

  const previousComments = canonicalizeComments(previousSource)
  const nextComments = canonicalizeComments(nextSource)
  if (
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
  if (
    TEMPLATE_SYNTAX.test(changed) ||
    changedLinesInJsx(previousSource, nextSource)
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

/**
 * Text edits inside JSX are template edits even though the changed line has
 * no tag marker. Parse both revisions with TypeScript/JSX enabled and compare
 * the line ranges covered by JSX nodes.
 */
function changedLinesInJsx(
  previousSource: string,
  nextSource: string,
): boolean {
  const previous = jsxLineRanges(previousSource)
  const next = jsxLineRanges(nextSource)
  if (!previous || !next) return false
  const changed = changedLineNumbers(previousSource, nextSource)
  return changed.some(
    line =>
      [...previous].some(range => range.start <= line && line <= range.end) ||
      [...next].some(range => range.start <= line && line <= range.end),
  )
}

interface JsxLineRange {
  readonly start: number
  readonly end: number
}

function jsxLineRanges(source: string): Set<JsxLineRange> | undefined {
  try {
    const file = parse(source, {
      sourceType: 'module',
      plugins: ['typescript', 'jsx'],
      attachComment: false,
    })
    const ranges = new Set<JsxLineRange>()
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
        ranges.add(
          Object.freeze({
            start: lineAt(source, value.start),
            end: lineAt(source, value.end),
          }),
        )
      }
      for (const [key, child] of Object.entries(value)) {
        if (key === 'loc' || key === 'start' || key === 'end') continue
        if (Array.isArray(child) || isSyntaxNode(child)) stack.push(child)
      }
    }
    return ranges
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
      if (comment.start == null || comment.end == null) return undefined
      text += source.slice(offset, comment.start)
      const body = DIRECTIVE_COMMENT.test(comment.value)
        ? comment.value
        : '__ZEUS_HMR_COMMENT__' +
          comment.value.replace(/[^\r\n\u2028\u2029]/g, '')
      text += comment.type === 'CommentBlock' ? `/*${body}*/` : `//${body}`
      offset = comment.end
    }
    return text + source.slice(offset)
  } catch {
    return undefined
  }
}
