// `@zeus-js/zeus/server` — the Node entry.
//
// Everything exported here is served by `@zeus-js/runtime-ssr` or the signal
// package, so importing this entry never loads the DOM runtime. The compiler
// moves each facade name of a mixed `@zeus-js/zeus` import to this module; the
// names that stay client-only keep importing from the public entry.
export {
  createSignal,
  createMemo,
  createEffect,
  createRoot,
  batch,
  onCleanup,
  type Accessor,
  type Setter,
} from '@zeus-js/signal'

export {
  renderToString,
  renderToStream,
  SSR_STREAMING_API_VERSION,
  Show,
  For,
  Portal,
  Transition,
  prop,
  event,
  ssrCustomElement,
  ssrHydrationMarker,
  defineElement,
  Host,
  Slot,
  ssrComponentFromManifest,
  serializeSSRNodeChunks,
} from '@zeus-js/runtime-ssr'

export {
  createContext,
  useContext,
  provide,
  inject,
} from '@zeus-js/runtime-ssr'

export type {
  SSRNode,
  SSRPrimitive,
  ShowProps,
  ForProps,
  SSRCustomElementOptions,
  SSRShadowRootOptions,
  SSRComponentManifest,
  SSRManifestComponent,
  SSRManifestProp,
  SSRDefineElementOptions,
  SSRPortalProps,
  SSRTransitionProps,
  RenderToStreamOptions,
  SSRStreamSource,
  ContextId,
  SSRContext,
  SSRContextProviderProps,
  SSRContextBridgeProps,
  SSROwner,
  ElementPropConstructor,
  PropDefinitionOptions,
  PropDefinition,
  ValuePropDefinition,
  ConstructorPropDefinition,
  EventDefinition,
  EventOptions,
  EmitsOptions,
} from '@zeus-js/runtime-ssr'
