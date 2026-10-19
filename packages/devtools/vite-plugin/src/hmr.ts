import path from 'node:path'

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

function changedLines(previousSource: string, nextSource: string): string[] {
  const previous = new Set(previousSource.split(/\r?\n/))
  const next = new Set(nextSource.split(/\r?\n/))

  return [
    ...[...previous].filter(line => !next.has(line)),
    ...[...next].filter(line => !previous.has(line)),
  ]
}

interface CommentCanonicalization {
  text: string
  unsafe: boolean
}

/**
 * Replaces comment bodies while keeping all executable and JSX text bytes.
 * This intentionally recognises only lexical string/template literals; an
 * ambiguous slash sequence is left untouched, which makes the classifier
 * conservative rather than risking a false state-preserving decision.
 */
function canonicalizeComments(source: string): CommentCanonicalization {
  let text = ''
  let unsafe = false
  let index = 0
  let state: 'normal' | 'single' | 'double' | 'template' = 'normal'
  let jsxDepth = 0
  let jsxTag = false
  let jsxClosingTag = false
  let jsxTagSelfClosing = false
  let jsxExpressionDepth = 0

  while (index < source.length) {
    const current = source[index]
    const next = source[index + 1]

    if (state === 'normal') {
      if (current === "'") {
        state = 'single'
        text += current
        index += 1
        continue
      }
      if (current === '"') {
        state = 'double'
        text += current
        index += 1
        continue
      }
      if (current === '`') {
        state = 'template'
        text += current
        index += 1
        continue
      }
      if (
        current === '<' &&
        !jsxTag &&
        isLikelyJSXTagStart(source, index, jsxDepth > 0)
      ) {
        jsxTag = true
        jsxClosingTag = next === '/'
        jsxTagSelfClosing = false
        text += current
        index += 1
        continue
      }
      if (jsxTag && jsxExpressionDepth === 0 && current === '>') {
        if (jsxClosingTag) {
          jsxDepth = Math.max(0, jsxDepth - 1)
        } else if (!jsxTagSelfClosing) {
          jsxDepth += 1
        }
        jsxTag = false
        jsxClosingTag = false
        jsxTagSelfClosing = false
        text += current
        index += 1
        continue
      }
      if (current === '{' && (jsxTag || jsxDepth > 0)) {
        jsxExpressionDepth += 1
        text += current
        index += 1
        continue
      }
      if (current === '}' && jsxExpressionDepth > 0) {
        jsxExpressionDepth -= 1
        text += current
        index += 1
        continue
      }
      if (jsxTag && current === '/' && next === '>') {
        jsxTagSelfClosing = true
      }
      if (
        jsxDepth > 0 &&
        !jsxTag &&
        jsxExpressionDepth === 0 &&
        current === '/' &&
        (next === '/' || next === '*')
      ) {
        // `/* ... */` and `// ...` are literal JSX text outside braces, not
        // JavaScript comments. Never preserve state for these edits.
        unsafe = true
        text += current
        index += 1
        continue
      }
      if (current === '/' && next === '/') {
        text += '//__ZEUS_HMR_COMMENT__'
        index += 2
        while (index < source.length && source[index] !== '\n') index += 1
        continue
      }
      if (current === '/' && next === '*') {
        text += '/*__ZEUS_HMR_COMMENT__*/'
        index += 2
        let closed = false
        while (
          index < source.length &&
          !(source[index] === '*' && source[index + 1] === '/')
        ) {
          index += 1
        }
        if (index < source.length) closed = true
        if (!closed) unsafe = true
        index = Math.min(source.length, index + 2)
        continue
      }
      if (current === '/' && next !== '>' && source[index - 1] !== '<') {
        // A regex literal or division can contain comment-like text. Once
        // one is encountered, reject preservation for the whole module.
        unsafe = true
      }
      text += current
      index += 1
      continue
    }

    text += current
    if (current === '\\') {
      if (index + 1 < source.length) text += source[index + 1]
      index += 2
      continue
    }
    if (
      (state === 'single' && current === "'") ||
      (state === 'double' && current === '"') ||
      (state === 'template' && current === '`')
    ) {
      state = 'normal'
    }
    index += 1
  }

  return { text, unsafe }
}

function isLikelyJSXTagStart(
  source: string,
  index: number,
  insideJSX: boolean,
): boolean {
  const next = source[index + 1]
  const nameStart = next === '/' ? source[index + 2] : next
  if (nameStart !== '>' && !/[A-Za-z]/.test(nameStart ?? '')) return false
  if (insideJSX) return true

  let previous = index - 1
  while (previous >= 0 && /\s/.test(source[previous] ?? '')) previous -= 1
  if (previous < 0 || /[([{=,:;!?&|>]/.test(source[previous] ?? '')) {
    return true
  }

  return /\b(?:return|yield|await|default)\s*$/.test(
    source.slice(Math.max(0, previous - 24), index),
  )
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
    !previousComments.unsafe &&
    !nextComments.unsafe &&
    previousComments.text === nextComments.text
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
