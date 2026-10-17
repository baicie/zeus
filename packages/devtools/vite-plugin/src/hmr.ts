import path from 'node:path'

export type ZeusHmrUpdateKind =
  | 'style-only'
  | 'template-structure'
  | 'signal-initialization'
  | 'component-api'
  | 'unknown'

export interface ZeusHmrUpdateClassification {
  kind: ZeusHmrUpdateKind
  strategy: 'vite-style' | 'dispose-remount'
  preserveState: false
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

/**
 * Classifies a source update for diagnostics and future state-retention work.
 * Every non-style class deliberately uses dispose-remount until a preservation
 * contract proves that owner, listener, and DOM identity can be retained.
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
