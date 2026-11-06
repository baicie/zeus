import { basicSetup } from 'codemirror'
import { css } from '@codemirror/lang-css'
import { javascript } from '@codemirror/lang-javascript'
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language'
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

export interface CodeEditorOptions {
  readonly parent: HTMLElement
  readonly doc: string
  readonly language: 'ts' | 'css'
  readonly theme: 'light' | 'dark'
  readonly fontSize: number
  readonly onChange: (value: string) => void
  readonly onRun: () => void
  readonly onSave: () => void
}

export interface CodeEditorHandle {
  setDoc(doc: string, language: 'ts' | 'css', errors: readonly number[]): void
  setAppearance(theme: 'light' | 'dark', fontSize: number): void
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
  let suppressChange = false

  const extensions = () => [
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
    languageCompartment.of(languageExtension(options.language)),
    appearanceCompartment.of(appearance(options.theme, options.fontSize)),
    errorLineField,
    syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({
      'data-testid': 'source',
      'aria-label': 'Code editor',
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
    extensions: extensions(),
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
    state = EditorState.create({ doc, extensions: extensions() })
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
      view.dispatch({
        effects: appearanceCompartment.reconfigure(appearance(theme, fontSize)),
      })
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

function appearance(theme: 'light' | 'dark', fontSize: number) {
  const dark = theme === 'dark'
  return [
    EditorView.theme(
      {
        '&': {
          height: '100%',
          backgroundColor: dark ? '#141a20' : '#fbfcfe',
          color: dark ? '#d6e2ea' : '#1f2937',
          fontSize: `${fontSize}px`,
        },
        '.cm-scroller': {
          fontFamily:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
          lineHeight: '1.65',
        },
        '.cm-content': { caretColor: dark ? '#7dd3fc' : '#0f766e' },
        '.cm-gutters': {
          backgroundColor: dark ? '#10161b' : '#f3f6f8',
          color: dark ? '#657582' : '#94a3b8',
          border: 'none',
        },
        '.cm-activeLine': {
          backgroundColor: dark
            ? 'rgba(125, 211, 252, 0.06)'
            : 'rgba(15, 118, 110, 0.06)',
        },
        '.cm-activeLineGutter': {
          backgroundColor: dark
            ? 'rgba(125, 211, 252, 0.08)'
            : 'rgba(15, 118, 110, 0.08)',
          color: dark ? '#bae6fd' : '#0f766e',
        },
        '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
          backgroundColor: dark
            ? 'rgba(56, 189, 248, 0.22)'
            : 'rgba(13, 148, 136, 0.16)',
        },
        '.cm-error-line': {
          backgroundColor: 'rgba(248, 113, 113, 0.16)',
          boxShadow: 'inset 2px 0 0 #f87171',
        },
        '.cm-tooltip': {
          backgroundColor: dark ? '#1b242c' : '#ffffff',
          border: `1px solid ${dark ? '#2b3944' : '#d8e1e8'}`,
        },
      },
      { dark },
    ),
  ]
}
