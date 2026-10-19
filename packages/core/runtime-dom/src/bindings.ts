import { normalizeDOMAttributeName } from '@zeus-js/shared'
import {
  effect,
  getCurrentEffect,
  getCurrentScope,
  onScopeDispose,
  untrack,
} from '@zeus-js/signal/internal'

import { emitDevtoolsEvent, getDevtoolsObjectId } from './devtools'
import { getScopeErrorBoundaryHandler } from './errorBoundaryContext'
import { assertRenderableJSXValue } from './jsxValue'

import type { AttrValue, ClassValue, JSXValue, StyleValue } from './types'
import type { DebuggerEvent } from '@zeus-js/signal/internal'

export function bindText(
  node: Text,
  value: () => JSXValue,
  once = false,
): void {
  applyBinding(
    value,
    once,
    next => {
      setTextData(node, stringifyText(next))
    },
    { kind: 'text', target: node },
  )
}

export function bindTextContent(
  el: Node,
  value: () => JSXValue,
  once = false,
): void {
  applyBinding(
    value,
    once,
    next => {
      setTextContent(el, stringifyText(next))
    },
    { kind: 'text-content', target: el },
  )
}

// Writing text is not as cheap as it looks: assigning `data` or `textContent`
// invalidates the element's text caches, and WebKit re-runs text shaping for
// the new string. Reactive bindings re-run whenever any dependency changes, so a
// grid that recycles pooled cells and rebinds the same visible text on every
// scroll would otherwise reshape thousands of long `nowrap` + ellipsis strings
// per commit. Comparing against live DOM state skips redundant writes and also
// repairs external mutations.
function setTextData(node: Text, serialized: string): void {
  if (node.data !== serialized) node.data = serialized
}

function setTextContent(el: Node, serialized: string): void {
  if (el.textContent !== serialized) el.textContent = serialized
}

function applyBinding<T>(
  value: () => T,
  once: boolean,
  apply: (next: T) => void,
  metadata: BindingMetadata,
): void {
  const devtoolsInstrumentation = __DEV__
  let bindingIdentity: object | undefined
  let trackedDependencies: DependencyMap | undefined
  let collectingDependencies: DependencyMap | undefined
  let bindingId: number | undefined
  let effectId: number | undefined

  const ensureBindingId = (): number => {
    bindingIdentity ??= {}
    bindingId ??= getDevtoolsObjectId(bindingIdentity)
    return bindingId
  }

  const run = () => {
    const scopeErrorHandler = getScopeErrorBoundaryHandler(getCurrentScope())
    const activeEffect = devtoolsInstrumentation
      ? getCurrentEffect()
      : undefined
    const observing = devtoolsInstrumentation && hasDevtoolsHook()
    if (observing) {
      ensureBindingId()
      if (activeEffect) effectId = getDevtoolsObjectId(activeEffect)
      trackedDependencies ??= new Map()
    }
    collectingDependencies = observing ? new Map() : undefined
    const started =
      typeof performance !== 'undefined' ? performance.now() : Date.now()
    let nextDependencies: DependencyMap | undefined
    let next: T
    try {
      next = value()
      apply(next)
      nextDependencies = collectingDependencies
    } catch (error) {
      if (scopeErrorHandler) {
        scopeErrorHandler(error)
        return
      }
      throw error
    } finally {
      collectingDependencies = undefined
    }
    const ended =
      typeof performance !== 'undefined' ? performance.now() : Date.now()

    if (devtoolsInstrumentation && hasDevtoolsHook()) {
      if (effectId !== undefined) {
        emitDevtoolsEvent(
          {
            type: 'effect:run',
            effectId,
            bindingId,
            payload: { duration: Math.max(0, ended - started) },
          },
          { swallowErrors: true },
        )
        reconcileDependencies(
          trackedDependencies,
          nextDependencies ?? new Map(),
          bindingId!,
          effectId,
        )
      }
      emitDevtoolsEvent(
        {
          type: 'binding:commit',
          bindingId,
          effectId,
          target: metadata.target,
          payload: {
            kind: metadata.kind,
            once,
            duration: Math.max(0, ended - started),
          },
        },
        { swallowErrors: true },
      )
    } else if (devtoolsInstrumentation) {
      trackedDependencies?.clear()
    }
  }

  if (once) {
    untrack(run)
    return
  }

  effect(
    run,
    devtoolsInstrumentation
      ? {
          onTrack: event => trackDependency(collectingDependencies, event),
          onTrigger: event => {
            if (!hasDevtoolsHook()) return
            triggerDependency(event, ensureBindingId())
          },
        }
      : undefined,
  )
  onScopeDispose(() => {
    if (bindingId === undefined) return
    if (effectId !== undefined && trackedDependencies) {
      reconcileDependencies(trackedDependencies, new Map(), bindingId, effectId)
    }
    emitDevtoolsEvent(
      {
        type: 'binding:cleanup',
        bindingId,
        effectId,
        target: metadata.target,
        payload: { kind: metadata.kind },
      },
      { swallowErrors: true },
    )
  }, true)
}

interface DependencyEdge {
  readonly sourceId: number
  readonly key: unknown
  readonly operation: unknown
}

type DependencyMap = Map<object, Map<unknown, DependencyEdge>>

function hasDevtoolsHook(): boolean {
  return typeof window !== 'undefined' && !!window.__ZEUS_DEVTOOLS_HOOK__
}

function trackDependency(
  dependencies: DependencyMap | undefined,
  event: DebuggerEvent,
): void {
  if (!dependencies || !hasDevtoolsHook() || !event.target) return

  let keys = dependencies.get(event.target)
  if (!keys) {
    keys = new Map()
    dependencies.set(event.target, keys)
  }
  keys.set(event.key, {
    sourceId: getDevtoolsObjectId(event.target),
    key: event.key,
    operation: event.type,
  })
}

function triggerDependency(
  event: DebuggerEvent,
  currentBindingId: number | undefined,
): void {
  if (!hasDevtoolsHook() || !event.target) return
  const activeEffect = event.effect
  emitDevtoolsEvent(
    {
      type: 'dependency:trigger',
      bindingId: currentBindingId,
      effectId: getDevtoolsObjectId(activeEffect),
      sourceId: getDevtoolsObjectId(event.target),
      payload: { key: event.key, operation: event.type },
    },
    { swallowErrors: true },
  )
}

function reconcileDependencies(
  previous: DependencyMap | undefined,
  next: DependencyMap,
  currentBindingId: number,
  currentEffectId: number,
): void {
  if (!previous) return
  for (const [target, previousKeys] of previous) {
    const nextKeys = next.get(target)
    for (const [key, edge] of previousKeys) {
      if (!nextKeys?.has(key)) {
        emitDependencyEvent(
          'dependency:untrack',
          edge,
          currentBindingId,
          currentEffectId,
        )
      }
    }
  }

  for (const [target, nextKeys] of next) {
    const previousKeys = previous.get(target)
    for (const [key, edge] of nextKeys) {
      if (!previousKeys?.has(key)) {
        emitDependencyEvent(
          'dependency:track',
          edge,
          currentBindingId,
          currentEffectId,
        )
      }
    }
  }

  previous.clear()
  for (const [target, keys] of next) previous.set(target, keys)
}

function emitDependencyEvent(
  type: 'dependency:track' | 'dependency:untrack',
  edge: DependencyEdge,
  currentBindingId: number,
  currentEffectId: number,
): void {
  emitDevtoolsEvent(
    {
      type,
      bindingId: currentBindingId,
      effectId: currentEffectId,
      sourceId: edge.sourceId,
      payload: { key: edge.key, operation: edge.operation },
    },
    { swallowErrors: true },
  )
}

interface BindingMetadata {
  kind: string
  target: Node
}

function stringifyText(value: JSXValue): string {
  if (typeof value === 'function') {
    throw new TypeError(
      'JSX children require values; call the function explicitly.',
    )
  }
  if (Array.isArray(value)) return value.map(stringifyText).join('')
  assertRenderableJSXValue(value)
  if (value == null || value === false || value === true) return ''
  if (typeof Node !== 'undefined' && value instanceof Node) {
    return value.textContent ?? ''
  }
  return String(value)
}

export function setAttr(el: Element, name: string, value: AttrValue): void {
  const attrName = normalizeAttrName(name)
  const propName = getBooleanDomPropertyName(name)
  const serialized = serializeAttrValue(value)

  // Reading the current attribute is far cheaper than writing it: a write
  // invalidates attribute caches and can force style or presentation work even
  // when the serialized value is identical. Reactive bindings usually re-run
  // with unchanged values (any dependency of the expression may have changed),
  // so skipping redundant writes removes a large amount of per-commit DOM work.
  // Comparing against live DOM state also repairs external mutations.
  const attrMatches =
    serialized === null
      ? !el.hasAttribute(attrName)
      : el.getAttribute(attrName) === serialized

  if (attrMatches) {
    if (!propName || !(el instanceof HTMLElement)) return
    if (
      Boolean(value) ===
      Boolean((el as HTMLElement & Record<string, unknown>)[propName])
    ) {
      return
    }
  }

  if (propName && el instanceof HTMLElement) {
    ;(el as HTMLElement & Record<string, unknown>)[propName] = Boolean(value)
  }

  if (serialized === null) el.removeAttribute(attrName)
  else el.setAttribute(attrName, serialized)
}

function writeAttr(el: Element, name: string, value: AttrValue): void {
  const attrName = normalizeAttrName(name)
  const propName = getBooleanDomPropertyName(name)
  const serialized = serializeAttrValue(value)

  if (propName && el instanceof HTMLElement) {
    ;(el as HTMLElement & Record<string, unknown>)[propName] = Boolean(value)
  }

  if (serialized === null) el.removeAttribute(attrName)
  else el.setAttribute(attrName, serialized)
}

function serializeAttrValue(value: AttrValue): string | null {
  if (typeof value === 'function') {
    throw new TypeError(
      'JSX attributes cannot contain functions; use prop:name for function values.',
    )
  }
  return value == null || value === false
    ? null
    : value === true
      ? ''
      : String(value)
}

function getBooleanDomPropertyName(name: string): string | undefined {
  return BOOLEAN_DOM_PROPERTY_NAME[name]
}

const BOOLEAN_DOM_PROPERTY_NAME: Record<string, string> = {
  hidden: 'hidden',
  disabled: 'disabled',
  readonly: 'readOnly',
  readOnly: 'readOnly',
  multiple: 'multiple',
  selected: 'selected',
  checked: 'checked',
  open: 'open',
  autofocus: 'autofocus',
  autoFocus: 'autofocus',
  indeterminate: 'indeterminate',
  noValidate: 'noValidate',
  novalidate: 'noValidate',
}

function normalizeAttrName(name: string): string {
  return normalizeDOMAttributeName(name)
}

export function bindAttr(
  el: Element,
  name: string,
  value: () => AttrValue,
  once = false,
): void {
  let previous: string | null | undefined
  let hasPrevious = false

  applyBinding(
    value,
    once,
    next => {
      const serialized = serializeAttrValue(next)

      // When a reactive binding changes, its target value is authoritative and
      // reading the old DOM value only adds work before the write. Keep the DOM
      // check for unchanged values so external mutations are still repaired.
      if (hasPrevious && serialized === previous) {
        setAttr(el, name, next)
      } else {
        writeAttr(el, name, next)
      }

      previous = serialized
      hasPrevious = true
    },
    { kind: `attr:${name}`, target: el },
  )
}

export function bindProp<T extends Element, K extends keyof T>(
  el: T,
  name: K,
  value: () => T[K],
  once = false,
): void {
  applyBinding(
    value,
    once,
    next => {
      if (!el.localName.includes('-') && Object.is(el[name], next)) return
      el[name] = next
    },
    { kind: `prop:${String(name)}`, target: el },
  )
}

export function bindClass(
  el: Element,
  value: () => ClassValue,
  once = false,
): void {
  applyBinding(
    value,
    once,
    value => {
      const next = normalizeClass(value)
      if (el.getAttribute('class') === (next || null)) return
      if (next) {
        el.setAttribute('class', next)
      } else {
        el.removeAttribute('class')
      }
    },
    { kind: 'class', target: el },
  )
}

export function normalizeClass(value: ClassValue): string {
  if (!value) return ''

  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    return value.map(normalizeClass).filter(Boolean).join(' ')
  }

  if (typeof value === 'object') {
    return Object.keys(value)
      .filter(key => value[key])
      .join(' ')
  }

  return ''
}

export function bindStyle(
  el: HTMLElement | SVGElement,
  value: () => StyleValue,
  once = false,
): void {
  let prev: StyleSnapshot | undefined

  applyBinding(
    value,
    once,
    next => {
      if (next == null) {
        if (el.hasAttribute('style')) el.removeAttribute('style')
        prev = undefined
        return
      }

      if (typeof next === 'string') {
        if (el.getAttribute('style') === next) return
        el.setAttribute('style', next)
        prev = undefined
        return
      }

      prev = patchStyle(
        el,
        prev,
        next as Record<string, string | number | null | undefined>,
      )
    },
    { kind: 'style', target: el },
  )
}

type StyleSnapshot = [values: Record<string, string>, state: string]

export function patchStyle(
  el: HTMLElement | SVGElement,
  prev: StyleSnapshot | undefined,
  next: Record<string, string | number | null | undefined>,
): StyleSnapshot {
  const style = (el as HTMLElement).style
  const values = prev
    ? prev[0]
    : (Object.create(null) as Record<string, string>)
  const keys = Object.keys(next)
  // `cssText` forces the CSSOM to re-serialize every declaration, so it is the
  // most expensive part of patching a style binding. Read it once to detect
  // external mutation, and only read it again when this patch actually wrote a
  // declaration. Bindings whose values are unchanged then cost zero writes
  // and zero re-serialization.
  const state = style.cssText + keys.join(',')
  const styleChanged = prev && state != prev[1]
  let wrote = false

  for (const key in values) {
    if (!(key in next)) {
      style.setProperty(
        key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`),
        '',
      )
      wrote = true
      delete values[key]
    }
  }

  for (const key in next) {
    const value = next[key]
    const expected = value == null ? '' : normalizeStyleValue(key, value)
    const previous = values[key]

    if (previous === expected && !styleChanged) {
      continue
    }

    style.setProperty(
      key.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`),
      expected,
    )
    wrote = true
    values[key] = expected
  }

  return prev && !wrote ? prev : [values, style.cssText + keys.join(',')]
}

function normalizeStyleValue(key: string, value: string | number): string {
  if (
    typeof value === 'number' &&
    value !== 0 &&
    unitlessNumbers[key] !== true
  ) {
    return `${value}px`
  }

  return String(value)
}

const unitlessNumbers: Record<string, true> = {
  opacity: true,
  zIndex: true,
  fontWeight: true,
  lineHeight: true,
  flex: true,
  flexGrow: true,
  flexShrink: true,
  order: true,
}
