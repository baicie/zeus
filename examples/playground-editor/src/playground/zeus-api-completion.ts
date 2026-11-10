import type {
  Completion,
  CompletionContext,
  CompletionResult,
} from '@codemirror/autocomplete'
import { syntaxTree } from '@codemirror/language'

import { zeusApiCompletions } from './zeus-api.generated'
import type { ApiCompletion } from './zeus-api'

/**
 * Completion source for the Zeus public API.
 *
 * The entries come from `zeus-api.generated.ts`, which is produced from the
 * published declaration files and checked by `pnpm api:check`, so a signature
 * change in the framework reaches the editor or fails CI.
 *
 * This is name-and-signature completion only: it has no type information and
 * never reports type errors. `Option` carries the real signature, so CodeMirror
 * shows it beside the label and inserts the call with the cursor inside the
 * parentheses.
 */

/** Kinds the editor colours differently. */
const TYPE_BY_KIND: Record<string, string> = {
  function: 'function',
  component: 'class',
  constant: 'variable',
}

function toOption(entry: ApiCompletion): Completion {
  const callable = entry.signature.includes('(')
  return {
    label: entry.name,
    type: TYPE_BY_KIND[entry.kind] ?? 'function',
    detail:
      entry.signature.length > 60
        ? `${entry.signature.slice(0, 57)}…`
        : entry.signature,
    info: entry.documentation || entry.signature,
    // Insert the call and place the caret inside the parentheses; no
    // signature-help engine exists here to fill the arguments.
    apply: callable
      ? (view, _completion, from, to) => {
          const text = `${entry.name}()`
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length - 1 },
          })
        }
      : entry.name,
  }
}

const options: readonly Completion[] = zeusApiCompletions.map(toOption)

/**
 * Offers Zeus API names when the caret starts a fresh identifier. Returns null
 * inside strings and comments so the popup does not fight normal typing.
 */
export function zeusApiCompletionSource(
  context: CompletionContext,
): CompletionResult | null {
  const token = context.matchBefore(/[A-Za-z_$][\w$]*/)
  const explicit = context.explicit
  if (!token && !explicit) return null
  if (token && token.from === token.to && !explicit) return null

  if (!explicit && isInCommentOrString(context)) return null

  // `explicit` is Ctrl-Space; without it, only suggest while a word is forming.
  const from = token ? token.from : context.pos
  const typed = token?.text ?? ''

  const matches = typed
    ? options.filter(option =>
        String(option.label).toLowerCase().startsWith(typed.toLowerCase()),
      )
    : [...options]

  if (matches.length === 0) return null
  return {
    from,
    options: matches,
    // Keep the popup open while the user types more of the same word.
    validFor: /^[\w$]*$/,
  }
}

/**
 * True when the caret sits in a comment or string literal.
 *
 * Uses the syntax tree when it is already available; falling back to a quote
 * scan would misread regular expressions and JSX text.
 */
function isInCommentOrString(context: CompletionContext): boolean {
  const tree = syntaxTree(context.state)
  const node = tree.resolveInner(context.pos, -1)
  for (
    let current: typeof node | null = node;
    current;
    current = current.parent
  ) {
    if (/(comment|string|template|regexp)/i.test(current.name)) return true
    if (current.name === 'Document') break
  }
  return false
}
