import { javascript } from '@codemirror/lang-javascript'
import { ensureSyntaxTree } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { highlightTree, tagHighlighter, tags } from '@lezer/highlight'

// The output panel only ever shows compiler output, so the parser is created
// once and reused; a per-call extension array would rebuild the language
// support for every tab switch.
const parserExtensions = [javascript({ jsx: true, typescript: true })]

/**
 * Renders compiler output with the same token classes the editor uses, without
 * mounting a second CodeMirror instance. The output panel shows whole modules,
 * so a lightweight one-shot highlight keeps the tab cheap: no view, no
 * decorations, no per-keystroke work.
 *
 * Colours come from `.pg-code-output .tok-*` in style.css, which are the same
 * VS Code Light/Dark Modern values as the editor palette.
 */

const highlighter = tagHighlighter([
  {
    tag: [tags.comment, tags.lineComment, tags.blockComment, tags.docComment],
    class: 'tok-comment',
  },
  {
    tag: [
      tags.keyword,
      tags.controlKeyword,
      tags.moduleKeyword,
      tags.definitionKeyword,
      tags.operatorKeyword,
      tags.modifier,
      tags.self,
      tags.null,
      tags.atom,
      tags.bool,
    ],
    class: 'tok-keyword',
  },
  {
    tag: [tags.string, tags.docString, tags.character, tags.attributeValue],
    class: 'tok-string',
  },
  { tag: [tags.regexp, tags.escape], class: 'tok-string' },
  {
    tag: [tags.number, tags.integer, tags.float, tags.color, tags.unit],
    class: 'tok-number',
  },
  {
    tag: [
      tags.function(tags.variableName),
      tags.function(tags.propertyName),
      tags.macroName,
    ],
    class: 'tok-function',
  },
  { tag: [tags.typeName, tags.className, tags.namespace], class: 'tok-type' },
  { tag: [tags.tagName, tags.angleBracket], class: 'tok-tag' },
  { tag: [tags.attributeName], class: 'tok-attribute' },
  {
    tag: [tags.propertyName, tags.definition(tags.propertyName)],
    class: 'tok-property',
  },
  {
    tag: [
      tags.variableName,
      tags.labelName,
      tags.definition(tags.variableName),
      tags.local(tags.variableName),
    ],
    class: 'tok-variable',
  },
  {
    tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator],
    class: 'tok-operator',
  },
  { tag: tags.invalid, class: 'tok-invalid' },
])

function escapeHtml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
}

/**
 * Returns HTML with `<span class="tok-*">` runs. Callers set it with
 * `innerHTML` on a node whose only child is this generated markup; the input is
 * the compiler's own output, never user-authored HTML.
 */
export function highlightCode(code: string): string {
  if (!code) return ''
  let state: EditorState
  try {
    state = EditorState.create({ doc: code, extensions: parserExtensions })
  } catch {
    return escapeHtml(code)
  }
  const tree = ensureSyntaxTree(state, code.length, 200)
  if (!tree) return escapeHtml(code)

  let html = ''
  let position = 0
  highlightTree(tree, highlighter, (from, to, classes) => {
    if (from > position) html += escapeHtml(code.slice(position, from))
    html += `<span class="${classes}">${escapeHtml(code.slice(from, to))}</span>`
    position = to
  })
  if (position < code.length) html += escapeHtml(code.slice(position))
  return html
}
