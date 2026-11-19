/**
 * Native modal APIs are unavailable in the preview.
 *
 * The preview iframe is embedded with `sandbox="allow-scripts"` and the
 * sandbox document is served with `Content-Security-Policy: sandbox
 * allow-scripts`; neither grants `allow-modals`, so the browser silently
 * ignores `alert`, `confirm`, `prompt`, and `print`. The grant stays off on
 * purpose: preview code is untrusted, and a shared link that loops a modal
 * could otherwise block the editor UI or trap the user in a dialog storm.
 *
 * Silence is not an acceptable contract, though. The sandbox installs this
 * guard so every suppressed call is reported once through the Console bridge
 * and returns exactly what the browser returns when a modal is suppressed:
 * `false` for `confirm`, `null` for `prompt`, and `undefined` for `alert` and
 * `print`.
 */

export const PLAYGROUND_MODAL_NAMES = [
  'alert',
  'confirm',
  'prompt',
  'print',
] as const

export type PlaygroundModalName = (typeof PLAYGROUND_MODAL_NAMES)[number]

export interface PlaygroundModalCall {
  readonly name: PlaygroundModalName
  readonly args: readonly unknown[]
}

export interface PlaygroundModalGuardOptions {
  /** Receives one record for every suppressed modal call. */
  readonly onCall: (call: PlaygroundModalCall) => void
  /**
   * Object that owns the modal methods. Defaults to the current global
   * object so the sandbox realm is patched in place.
   */
  readonly target?: Partial<Record<PlaygroundModalName, unknown>> | undefined
}

export interface PlaygroundModalGuard {
  /** Restores the original methods when the sandbox realm is torn down. */
  dispose(): void
}

const MAX_ARGUMENT_CHARS = 200

/** Builds the one-line diagnostic a host forwards to its Console panel. */
export function formatPlaygroundModalCall(call: PlaygroundModalCall): string {
  const argumentsText =
    call.args.length === 0 ? '' : call.args.map(formatArgument).join(', ')
  return `[ZEUS_PLAYGROUND_NO_MODALS] ${call.name}(${argumentsText}) was ignored. Preview code runs without native modals; render the message in the DOM or use console.log instead.`
}

/**
 * Replaces the modal entry points on `target` (the sandbox window by default).
 * Safe to call once per realm; disposing restores the previous values only if
 * the guard's replacement is still installed.
 */
export function installPlaygroundModalGuard(
  options: PlaygroundModalGuardOptions,
): PlaygroundModalGuard {
  const target =
    options.target ??
    (globalThis as unknown as Partial<Record<PlaygroundModalName, unknown>>)
  const previous = new Map<PlaygroundModalName, unknown>()
  const replacements = new Map<PlaygroundModalName, unknown>()

  for (const name of PLAYGROUND_MODAL_NAMES) {
    previous.set(name, Reflect.get(target, name))
    const replacement = (...args: unknown[]): unknown => {
      options.onCall({ name, args })
      if (name === 'confirm') return false
      if (name === 'prompt') return null
      return undefined
    }
    replacements.set(name, replacement)
    Reflect.set(target, name, replacement)
  }

  return {
    dispose() {
      for (const name of PLAYGROUND_MODAL_NAMES) {
        if (Reflect.get(target, name) !== replacements.get(name)) continue
        const original = previous.get(name)
        if (original === undefined) Reflect.deleteProperty(target, name)
        else Reflect.set(target, name, original)
      }
    },
  }
}

function formatArgument(value: unknown): string {
  const text = stringifyArgument(value)
  if (text.length <= MAX_ARGUMENT_CHARS) return text
  return `${text.slice(0, MAX_ARGUMENT_CHARS - 3)}...`
}

function stringifyArgument(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value)
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint' ||
    value === null ||
    value === undefined
  ) {
    return String(value)
  }
  try {
    return JSON.stringify(value) ?? String(value)
  } catch {
    return String(value)
  }
}
