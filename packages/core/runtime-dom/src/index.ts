import './types'

export type {
  JSXValue,
  JSXGetter,
  Component,
  TemplateFactory,
  AttrValue,
  ClassValue,
  StyleValue,
  RefTarget,
} from './types'

export { template } from './template'

export { render, type RenderOptions } from './render'
export {
  hydrate,
  hydratePlan,
  type HydrationBindingHandler,
  type HydrationContext,
  type HydrationPlan,
  type HydrationPlanBinding,
  type HydrationPlanComponent,
  type HydrationPlanNode,
} from './hydration'

export { insert, mountDynamic } from './insert'

export { Portal, type PortalProps } from './portal'

export { ErrorBoundary, type ErrorBoundaryProps } from './errorBoundary'

export {
  Transition,
  mountTransition,
  transition,
  type TransitionClassSpec,
  type TransitionClassValue,
  type TransitionContext,
  type TransitionDuration,
  type TransitionHandle,
  type TransitionHook,
  type TransitionHookResult,
  type TransitionOptions,
  type TransitionPhase,
  type TransitionProps,
  type TransitionSpec,
} from './transition'

export { insertTracked } from './insert'
export { isWithinRuntimeDomMove } from './domMove'

export { marker, child, removeNodes } from './dom'

export {
  bindText,
  bindTextContent,
  bindAttr,
  bindProp,
  bindClass,
  bindStyle,
  setAttr,
  normalizeClass,
} from './bindings'

export { bindEvent, delegateEvents } from './events'

export { setRef, bindRef } from './refs'

export { createComponent } from './component'

export {
  Show,
  For,
  mountShow,
  mountFor,
  resolveValue,
  type ShowProps,
  type ForProps,
} from './controlFlow'

export {
  defineElement,
  event,
  getElementDefinition,
  mountElementDefinition,
  prop,
  ZEUS_ELEMENT_DEFINITION,
  type DefineElementOptions,
  type DefineElementMeta,
  type DefineElementContext,
  type DefineElementSetup,
  type ElementPropConstructor,
  type ElementModelDefinition,
  type EmitApi,
  type EmitsOptions,
  type EventDefinition,
  type EventOptions,
  type FormAssociatedOptions,
  type FormAssociatedValue,
  type FormStateRestoreMode,
  type PropDefinition,
  type PropDefinitionOptions,
  type PropReactivity,
  type PropDeserializer,
  type PropOptions,
  type PropSerializer,
  type ValuePropDefinition,
  type MountedElementDefinition,
  type ElementDefinitionMountState,
  type NormalizedPropDefinition,
  type ZeusElementConstructor,
  type ZeusElementDefinition,
} from './defineElement'

export {
  coerceCustomElementAttribute,
  createCustomElementMountLifecycle,
  findCustomElementPropByAttribute,
  getCustomElementAttributeName,
  getCustomElementObservedAttributes,
  reflectCustomElementProperty,
} from './customElementContract'

export type {
  CustomElementMount,
  CustomElementMountLifecycle,
  CustomElementPropSchema,
  CustomElementPropType,
  NormalizedPropChange,
} from './customElementContract'

export { Host, Slot, type HostProps, type SlotProps } from './webComponents'

export { createSlot } from './slot'

export {
  getCurrentHostContext,
  withHostContext,
  captureCurrentHostContext,
  withCapturedHostContext,
  type HostRenderContext,
  type HostRenderMode,
} from './hostContext'

// context — main user-facing APIs
export { createContext, useContext, provide, inject } from './context'

// context — advanced / internal APIs
export {
  getCurrentOwner,
  createOwner,
  runWithOwner,
  createDOMContextBoundary,
  provideDOMContext,
  resolveDOMContext,
  ZEUS_CONTEXT_REQUEST,
  type Context,
  type ContextId,
  type ContextProviderProps,
  type ContextBridgeProps,
  type Owner,
  type ZeusContextRequestDetail,
  type ZeusContextRequestEvent,
  type DOMContextResolution,
} from './context'
export { bindSpread, mergeProps } from './spread'
