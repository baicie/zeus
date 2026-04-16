export { defineElement } from './define-element'
export type { ElementOptions } from './define-element'

export { createHost, getHostRoot } from './host'
export type { HostOptions } from './host'

export { createSlotMarker, collectSlotMarkers } from './slot'
export type { SlotOptions, SlotMarker } from './slot'

export { coerceAttribute, coerceProperty, reflectAttribute } from './attr-prop'
export type { PropType } from './attr-prop'

export { setupLightDomProjection, cleanupProjection } from './light-dom-projection'
export type { ProjectionRecord } from './light-dom-projection'
