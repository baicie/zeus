import { createComponentEvent } from './extractEmits'

import type { DefineElementCallRecord } from './extractDefineElement'
import type { InlineMeta } from './extractMeta'
import type { SetupMeta } from './extractSetup'
import type {
  ComponentEvent,
  ComponentCssVar,
  ComponentMethod,
  ComponentProp,
  ComponentRecord,
  ComponentSlot,
} from './types'

export interface BuildRecordOptions {
  file: string
  call: DefineElementCallRecord
  runtimeProps: Record<string, ComponentProp>
  runtimePropsDiagnostics?: string[]
  emits: Record<string, ComponentEvent>
  typeProps: Record<string, Partial<ComponentProp>>
  setupMeta: SetupMeta
  inlineMeta: InlineMeta
  shadow?: boolean
}

export function buildComponentRecord(
  options: BuildRecordOptions,
): ComponentRecord {
  const {
    file,
    call,
    runtimeProps,
    runtimePropsDiagnostics,
    emits: declaredEvents,
    typeProps,
    setupMeta,
    inlineMeta,
    shadow,
  } = options

  const props = mergeProps(
    runtimeProps,
    typeProps,
    inlineMeta.props as Record<string, Partial<ComponentProp>> | undefined,
  )

  const events = mergeEvents(
    declaredEvents,
    setupMeta.events,
    inlineMeta.events as Record<string, ComponentEvent> | undefined,
  )

  const methods = mergeMethods(setupMeta.methods, inlineMeta.methods)

  const slots = mergeSlots(setupMeta.slots, inlineMeta.slots)

  const cssParts = unique([
    ...setupMeta.cssParts,
    ...toStringArray(inlineMeta.cssParts),
  ])

  const cssVars = toCssVarsRecord(inlineMeta.cssVars)

  const hostAttributes = unique(setupMeta.hostAttributes)

  const restMeta = stripKnownMetaFields(inlineMeta)

  return {
    tag: call.tag,
    name: call.name,
    exportName: call.exportName,
    source: file,

    props,
    runtimeProps,
    runtimePropsDiagnostics: runtimePropsDiagnostics?.length
      ? runtimePropsDiagnostics
      : undefined,

    events,
    methods,
    slots,
    hostAttributes,
    cssParts,
    cssVars,
    description:
      typeof inlineMeta.description === 'string'
        ? inlineMeta.description
        : undefined,
    meta:
      shadow !== undefined || restMeta ? { ...restMeta, shadow } : undefined,
  }
}

function mergeProps(
  runtimeProps: Record<string, ComponentProp>,
  typeProps: Record<string, Partial<ComponentProp>>,
  metaProps?: Record<string, Partial<ComponentProp>>,
): Record<string, ComponentProp> {
  const names = unique([
    ...Object.keys(runtimeProps),
    ...Object.keys(typeProps),
    ...Object.keys(metaProps ?? {}),
  ])

  const result: Record<string, ComponentProp> = {}

  for (const name of names) {
    const tp = typeProps[name] ?? {}
    const rp = runtimeProps[name] ?? {}
    const mp = metaProps?.[name] ?? {}

    result[name] = {
      type: rp.type ?? tp.type ?? 'unknown',
      required: tp.required,
      values: rp.values ?? tp.values,
      description: tp.description ?? mp.description,
      default: rp.default ?? mp.default,
      reflect: rp.reflect ?? mp.reflect,
      attr: rp.attr ?? mp.attr,
    }
  }

  return result
}

function mergeEvents(
  declared: Record<string, ComponentEvent>,
  inferred: Record<string, ComponentEvent>,
  explicit?: Record<string, ComponentEvent>,
): Record<string, ComponentEvent> {
  const result: Record<string, ComponentEvent> = {
    ...inferred,
    ...declared,
  }

  for (const [key, value] of Object.entries(explicit ?? {})) {
    result[key] = normalizeExplicitEvent(key, value, result[key])
  }

  return result
}

function normalizeExplicitEvent(
  key: string,
  value: ComponentEvent,
  base: ComponentEvent | undefined,
): ComponentEvent {
  const fallback = base ?? createComponentEvent(key)

  return {
    key: value.key ?? fallback.key,
    name: value.name ?? fallback.name,
    reactName: value.reactName ?? fallback.reactName,
    detail: value.detail ?? fallback.detail,
    bubbles: value.bubbles ?? fallback.bubbles,
    composed: value.composed ?? fallback.composed,
    cancelable: value.cancelable ?? fallback.cancelable,
    description: value.description ?? fallback.description,
  }
}

function mergeMethods(
  inferred: Record<string, ComponentMethod>,
  explicit: unknown,
): Record<string, ComponentMethod> {
  const result: Record<string, ComponentMethod> = {
    ...inferred,
  }

  if (Array.isArray(explicit)) {
    for (const name of explicit) {
      if (typeof name === 'string') {
        result[name] = { name }
      }
    }
  }

  return result
}

function mergeSlots(
  inferred: Record<string, ComponentSlot>,
  explicit?: unknown,
): Record<string, ComponentSlot> {
  if (Array.isArray(explicit)) {
    const result = {
      ...inferred,
    }

    for (const name of explicit) {
      if (typeof name === 'string') {
        result[name] = {
          name,
        }
      }
    }

    return result
  }

  if (!explicit || typeof explicit !== 'object') {
    return {
      ...inferred,
    }
  }

  return {
    ...inferred,
    ...(explicit as Record<string, ComponentSlot>),
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
}

function toCssVarsRecord(value: unknown): Record<string, ComponentCssVar> {
  if (Array.isArray(value)) {
    const result: Record<string, ComponentCssVar> = {}

    for (const item of value) {
      if (typeof item === 'string') {
        result[item] = { name: item }
      }
    }

    return result
  }

  if (value && typeof value === 'object') {
    const result: Record<string, ComponentCssVar> = {}

    for (const [name, item] of Object.entries(value)) {
      if (item && typeof item === 'object') {
        const description = (item as { description?: unknown }).description
        result[name] = {
          name,
          description:
            typeof description === 'string' ? description : undefined,
        }
      } else {
        result[name] = { name }
      }
    }

    return result
  }

  return {}
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort()
}

function stripKnownMetaFields(
  meta: InlineMeta,
): Record<string, unknown> | undefined {
  const rest = { ...meta }

  delete rest.description
  delete rest.props
  delete rest.events
  delete rest.slots
  delete rest.cssVars
  delete rest.cssParts
  delete rest.shadow
  delete rest.methods

  return Object.keys(rest).length ? rest : undefined
}
