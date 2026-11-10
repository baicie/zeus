import { basicSetup } from 'codemirror'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { indentWithTab } from '@codemirror/commands'
import {
  Compartment,
  EditorState,
  RangeSetBuilder,
  StateEffect,
  StateField,
} from '@codemirror/state'
import {
  Decoration,
  EditorView,
  keymap,
  type DecorationSet,
} from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { tags } from '@lezer/highlight'

import type { ThemeName } from './persistence'
import { zeusApiCompletionSource } from './zeus-api-completion'

export interface CodeEditorOptions {
  readonly parent: HTMLElement
  readonly doc: string
  readonly language: 'ts' | 'css'
  readonly theme: ThemeName
  readonly fontSize: number
  readonly ariaLabel: string
  readonly onChange: (value: string) => void
  readonly onRun: () => void
  readonly onSave: () => void
}

export interface CodeEditorHandle {
  setDoc(doc: string, language: 'ts' | 'css', errors: readonly number[]): void
  setAppearance(theme: ThemeName, fontSize: number): void
  setAriaLabel(label: string): void
  setErrors(errors: readonly number[]): void
  focusLine(line: number): void
  getValue(): string
  destroy(): void
}

const setErrorLines = StateEffect.define<readonly number[]>()
const errorLineField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    let next = decorations.map(transaction.changes)
    for (const effect of transaction.effects) {
      if (!effect.is(setErrorLines)) continue
      const builder = new RangeSetBuilder<Decoration>()
      const lines = [...new Set(effect.value)]
        .filter(line => line >= 1 && line <= transaction.state.doc.lines)
        .sort((left, right) => left - right)
      for (const line of lines) {
        builder.add(
          transaction.state.doc.line(line).from,
          transaction.state.doc.line(line).from,
          Decoration.line({ class: 'cm-error-line' }),
        )
      }
      next = builder.finish()
    }
    return next
  },
  provide: field => EditorView.decorations.from(field),
})

export function mountCodeEditor(options: CodeEditorOptions): CodeEditorHandle {
  const languageCompartment = new Compartment()
  const appearanceCompartment = new Compartment()
  let currentDoc = options.doc
  let currentLanguage = options.language
  let currentErrors: readonly number[] = []
  let currentTheme = options.theme
  let currentFontSize = options.fontSize
  let suppressChange = false

  // The syntax highlighter is theme-dependent, so it lives inside the
  // appearance compartment and can be swapped without recreating the document
  // (which would drop undo history and the cursor).
  // The syntax palette is theme-specific, so it ships inside the appearance
  // compartment. `basicSetup` registers a stock light-only fallback style, and
  // the first fallback per tag wins, so ours must come before `basicSetup`.
  const extensions = (language: 'ts' | 'css') => [
    appearanceCompartment.of(appearance(currentTheme, currentFontSize)),
    // Zeus API names are added through `languageData`, which appends to the
    // sources `basicSetup` already collects. `autocompletion({ override })`
    // would replace them and lose the language's own completions.
    //
    // Only for TypeScript: a stylesheet has no place for `createSignal`, and
    // the CSS language would still offer it because this data is not scoped to
    // the JS grammar.
    ...(language === 'ts'
      ? [
          EditorState.languageData.of(() => [
            { autocomplete: zeusApiCompletionSource },
          ]),
        ]
      : []),
    basicSetup,
    keymap.of([
      indentWithTab,
      {
        key: 'Mod-Enter',
        run: () => {
          options.onRun()
          return true
        },
      },
      {
        key: 'Mod-s',
        preventDefault: true,
        run: () => {
          options.onSave()
          return true
        },
      },
    ]),
    languageCompartment.of(languageExtension(language)),
    errorLineField,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      'data-testid': 'source',
      'aria-label': options.ariaLabel,
      spellcheck: 'false',
      autocapitalize: 'off',
      autocomplete: 'off',
    }),
    EditorView.updateListener.of(update => {
      if (!update.docChanged || suppressChange) return
      currentDoc = update.state.doc.toString()
      options.onChange(currentDoc)
    }),
  ]

  let state = EditorState.create({
    doc: currentDoc,
    extensions: extensions(currentLanguage),
  })
  let view = new EditorView({ state, parent: options.parent })
  if (currentErrors.length > 0)
    view.dispatch({ effects: setErrorLines.of(currentErrors) })

  function recreate(
    doc: string,
    language: 'ts' | 'css',
    errors: readonly number[],
  ): void {
    currentDoc = doc
    currentLanguage = language
    currentErrors = errors
    suppressChange = true
    state = EditorState.create({ doc, extensions: extensions(language) })
    view.setState(state)
    if (errors.length > 0) view.dispatch({ effects: setErrorLines.of(errors) })
    suppressChange = false
  }

  return {
    setDoc(doc, language, errors) {
      if (
        doc === currentDoc &&
        language === currentLanguage &&
        arraysEqual(errors, currentErrors)
      ) {
        return
      }
      recreate(doc, language, errors)
    },
    setAppearance(theme, fontSize) {
      if (theme === currentTheme && fontSize === currentFontSize) return
      currentTheme = theme
      currentFontSize = fontSize
      view.dispatch({
        effects: appearanceCompartment.reconfigure(appearance(theme, fontSize)),
      })
    },
    setAriaLabel(label) {
      view.contentDOM.setAttribute('aria-label', label)
    },
    setErrors(errors) {
      if (arraysEqual(errors, currentErrors)) return
      currentErrors = errors
      view.dispatch({ effects: setErrorLines.of(errors) })
    },
    focusLine(line) {
      const safe = Math.max(1, Math.min(line, view.state.doc.lines))
      const position = view.state.doc.line(safe).from
      view.dispatch({
        selection: { anchor: position },
        effects: EditorView.scrollIntoView(position, { y: 'center' }),
      })
      view.focus()
    },
    getValue() {
      return view.state.doc.toString()
    },
    destroy() {
      view.destroy()
      options.parent.replaceChildren()
    },
  }
}

function arraysEqual(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  )
}

function languageExtension(language: 'ts' | 'css') {
  return language === 'css'
    ? css()
    : javascript({ jsx: true, typescript: true })
}

interface EditorPalette {
  readonly background: string
  readonly foreground: string
  readonly caret: string
  readonly gutter: string
  readonly gutterText: string
  readonly activeLine: string
  readonly activeGutter: string
  readonly selection: string
  readonly tooltip: string
  readonly tooltipBorder: string
  readonly errorLine: string
  readonly errorEdge: string
  readonly syntax: {
    readonly comment: string
    readonly keyword: string
    readonly string: string
    readonly number: string
    readonly function: string
    readonly type: string
    readonly variable: string
    readonly property: string
    readonly operator: string
    readonly tag: string
    readonly attribute: string
    readonly invalid: string
  }
}

/** VS Code Light Modern / Dark Modern syntax palettes. */
const palettes: Record<ThemeName, EditorPalette> = {
  light: {
    background: '#ffffff',
    foreground: '#1f1f1f',
    caret: '#000000',
    gutter: '#ffffff',
    gutterText: '#6e7681',
    activeLine: 'rgba(0, 0, 0, 0.035)',
    activeGutter: 'rgba(0, 0, 0, 0.05)',
    selection: 'rgba(0, 95, 184, 0.18)',
    tooltip: '#ffffff',
    tooltipBorder: '#c8c8c8',
    errorLine: 'rgba(205, 49, 49, 0.09)',
    errorEdge: '#cd3131',
    syntax: {
      comment: '#008000',
      keyword: '#0000ff',
      string: '#a31515',
      number: '#098658',
      function: '#795e26',
      type: '#267f99',
      variable: '#001080',
      property: '#001080',
      operator: '#000000',
      tag: '#800000',
      attribute: '#e50000',
      invalid: '#cd3131',
    },
  },
  dark: {
    background: '#1f1f1f',
    foreground: '#cccccc',
    caret: '#aeafad',
    gutter: '#1f1f1f',
    gutterText: '#858585',
    activeLine: 'rgba(255, 255, 255, 0.045)',
    activeGutter: 'rgba(255, 255, 255, 0.06)',
    selection: 'rgba(38, 79, 120, 0.75)',
    tooltip: '#202020',
    tooltipBorder: '#454545',
    errorLine: 'rgba(248, 81, 73, 0.14)',
    errorEdge: '#f85149',
    syntax: {
      comment: '#6a9955',
      keyword: '#569cd6',
      string: '#ce9178',
      number: '#b5cea8',
      function: '#dcdcaa',
      type: '#4ec9b0',
      variable: '#9cdcfe',
      property: '#9cdcfe',
      operator: '#d4d4d4',
      tag: '#569cd6',
      attribute: '#9cdcfe',
      invalid: '#f85149',
    },
  },
}

function highlightStyle(theme: ThemeName): HighlightStyle {
  const { syntax } = palettes[theme]
  return HighlightStyle.define([
    {
      tag: [tags.comment, tags.lineComment, tags.blockComment],
      color: syntax.comment,
      fontStyle: 'italic',
    },
    { tag: tags.docComment, color: syntax.comment, fontStyle: 'italic' },
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
      color: syntax.keyword,
    },
    {
      tag: [tags.string, tags.docString, tags.character, tags.attributeValue],
      color: syntax.string,
    },
    { tag: [tags.regexp, tags.escape], color: syntax.string },
    {
      tag: [tags.number, tags.integer, tags.float, tags.color, tags.unit],
      color: syntax.number,
    },
    {
      tag: [
        tags.function(tags.variableName),
        tags.function(tags.propertyName),
        tags.macroName,
      ],
      color: syntax.function,
    },
    {
      tag: [tags.typeName, tags.className, tags.namespace],
      color: syntax.type,
    },
    {
      tag: [tags.tagName, tags.angleBracket],
      color: syntax.tag,
    },
    { tag: [tags.attributeName], color: syntax.attribute },
    {
      tag: [
        tags.variableName,
        tags.labelName,
        tags.constant(tags.variableName),
      ],
      color: syntax.variable,
    },
    {
      tag: [tags.propertyName, tags.definition(tags.propertyName)],
      color: syntax.property,
    },
    {
      tag: [tags.operator, tags.punctuation, tags.bracket, tags.separator],
      color: syntax.operator,
    },
    { tag: tags.definition(tags.variableName), color: syntax.variable },
    { tag: tags.local(tags.variableName), color: syntax.variable },
    { tag: tags.special(tags.variableName), color: syntax.function },
    { tag: tags.invalid, color: syntax.invalid },
  ])
}

function appearance(theme: ThemeName, fontSize: number): Extension[] {
  const palette = palettes[theme]
  const dark = theme === 'dark'
  return [
    syntaxHighlighting(highlightStyle(theme), { fallback: true }),
    EditorView.theme(
      {
        '&': {
          height: '100%',
          backgroundColor: palette.background,
          color: palette.foreground,
          fontSize: `${fontSize}px`,
        },
        '.cm-scroller': {
          fontFamily:
            '"SF Mono", Monaco, Menlo, Consolas, "Ubuntu Mono", "Liberation Mono", ui-monospace, monospace',
          lineHeight: '1.6',
        },
        '.cm-content': { caretColor: palette.caret },
        '.cm-cursor, .cm-dropCursor': { borderLeftColor: palette.caret },
        '.cm-gutters': {
          backgroundColor: palette.gutter,
          color: palette.gutterText,
          border: 'none',
        },
        '.cm-activeLine': { backgroundColor: palette.activeLine },
        '.cm-activeLineGutter': {
          backgroundColor: palette.activeGutter,
          color: dark ? '#cccccc' : '#1f1f1f',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection':
          { backgroundColor: palette.selection },
        '.cm-error-line': {
          backgroundColor: palette.errorLine,
          boxShadow: `inset 2px 0 0 ${palette.errorEdge}`,
        },
        '.cm-tooltip': {
          backgroundColor: palette.tooltip,
          border: `1px solid ${palette.tooltipBorder}`,
        },
        '.cm-panels': {
          backgroundColor: dark ? '#181818' : '#f3f3f3',
          color: palette.foreground,
        },
        '.cm-searchMatch': {
          backgroundColor: dark
            ? 'rgba(234, 92, 0, 0.33)'
            : 'rgba(234, 92, 0, 0.25)',
        },
        '.cm-matchingBracket': {
          backgroundColor: dark
            ? 'rgba(0, 120, 212, 0.28)'
            : 'rgba(0, 95, 184, 0.16)',
          outline: 'none',
        },
      },
      { dark },
    ),
  ]
}
