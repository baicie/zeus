import type { DefineElementCallRecord } from './extractDefineElement'
import type { InlineMeta } from './extractMeta'
import type { SetupMeta } from './extractSetup'
import type {
  ComponentEvent,
  ComponentProp,
  ComponentRecord,
  ComponentSlot,
} from './types'

export interface BuildRecordOptions {
  file: string
  call: DefineElementCallRecord
  runtimeProps: Record<string, ComponentProp>
  typeProps: Record<string, Partial<ComponentProp>>
  setupMeta: SetupMeta
  inlineMeta: InlineMeta
  shadow?: boolean
}

export function buildComponentRecord(
  options: BuildRecordOptions,
): ComponentRecord {
  const { file, call, runtimeProps, typeProps, setupMeta, inlineMeta, shadow } =
    options

  const props = mergeProps(
    runtimeProps,
    typeProps,
    inlineMeta.props as Record<string, Partial<ComponentProp>> | undefined,
  )

  const events = mergeEvents(
    setupMeta.events,
    inlineMeta.events as Record<string, ComponentEvent> | undefined,
  )

  const slots = mergeSlots(
    setupMeta.slots,
    inlineMeta.slots as Record<string, ComponentSlot> | undefined,
  )

  const cssParts = unique([
    ...setupMeta.cssParts,
    ...toStringArray(inlineMeta.cssParts),
  ])

  const cssVars = unique(toStringArray(inlineMeta.cssVars))

  const hostAttributes = unique(setupMeta.hostAttributes)

  const restMeta = stripKnownMetaFields(inlineMeta)

  return {
    tag: call.tag,
    name: call.name,
    exportName: call.exportName,
    source: file,
    props,
    events,
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
      values: tp.values,
      description: tp.description ?? mp.description,
      default: rp.default ?? mp.default,
      reflect: rp.reflect ?? mp.reflect,
      attr: rp.attr ?? mp.attr,
    }
  }

  return result
}

function mergeEvents(
  inferred: Record<string, ComponentEvent>,
  explicit?: Record<string, ComponentEvent>,
): Record<string, ComponentEvent> {
  return {
    ...inferred,
    ...(explicit ?? {}),
  }
}

function mergeSlots(
  inferred: Record<string, ComponentSlot>,
  explicit?: Record<string, ComponentSlot>,
): Record<string, ComponentSlot> {
  return {
    ...inferred,
    ...(explicit ?? {}),
  }
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : []
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

  return Object.keys(rest).length ? rest : undefined
}
