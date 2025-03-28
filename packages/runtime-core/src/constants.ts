export const IS_DEV = process.env.NODE_ENV !== 'production'

export const enum PatchFlags {
  TEXT = 1,
  CLASS = 2,
  STYLE = 4,
  PROPS = 8,
  FULL_PROPS = 16,
  HYDRATE_EVENTS = 32,
  STABLE_FRAGMENT = 64,
  KEYED_FRAGMENT = 128,
  UNKEYED_FRAGMENT = 256,
  NEED_PATCH = 512,
  DYNAMIC_SLOTS = 1024,
  HOISTED = -1,
  BAIL = -2,
}

export const enum ShapeFlags {
  ELEMENT = 1,
  FUNCTIONAL_COMPONENT = 2,
  STATEFUL_COMPONENT = 4,
  TEXT_CHILDREN = 8,
  ARRAY_CHILDREN = 16,
  SLOTS_CHILDREN = 32,
  TELEPORT = 64,
  SUSPENSE = 128,
  COMPONENT_SHOULD_KEEP_ALIVE = 256,
  COMPONENT_KEPT_ALIVE = 512,
  COMPONENT = STATEFUL_COMPONENT | FUNCTIONAL_COMPONENT,
}
