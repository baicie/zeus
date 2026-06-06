import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateVueWrapperOptions {
  component: ComponentRecord
  wcModuleId: string
  mode?: 'minimal' | 'event-bridge'
}

interface WrapperCapabilities {
  eventNames: string[]
  propNames: string[]
  slotNames: string[]
}

export function generateVueWrapper(input: GenerateVueWrapperOptions): string {
  return input.mode === 'event-bridge'
    ? generateEventBridgeVueWrapper(input)
    : generateMinimalVueWrapper(input)
}

function generateMinimalVueWrapper(input: GenerateVueWrapperOptions): string {
  const { component, wcModuleId } = input
  const slotNames = getNamedSlots(component)
  const hasNamedSlots = slotNames.length > 0
  const vueImports = hasNamedSlots
    ? 'cloneVNode, defineComponent, h'
    : 'defineComponent, h'

  return `
import { ${vueImports} } from 'vue';

import ${JSON.stringify(wcModuleId)};
${hasNamedSlots ? `\nconst NAMED_SLOTS = ${JSON.stringify(slotNames)};\n` : ''}
export const ${component.name} = defineComponent({
  name: ${JSON.stringify(component.name)},
  inheritAttrs: false,

  setup(_props, { attrs, slots }) {
    return () => {
${generateVueChildren(slotNames)}
      return h(${JSON.stringify(component.tag)}, attrs, children);
    };
  },
});
${hasNamedSlots ? VUE_NAMED_SLOT_HELPERS : ''}
`.trimStart()
}

function generateEventBridgeVueWrapper(
  input: GenerateVueWrapperOptions,
): string {
  const { component, wcModuleId } = input
  const capabilities = getCapabilities(component)
  const { eventNames, propNames, slotNames } = capabilities

  if (!propNames.length && !eventNames.length) {
    return generateMinimalVueWrapper(input)
  }

  const hasProps = propNames.length > 0
  const hasEvents = eventNames.length > 0
  const hasNamedSlots = slotNames.length > 0
  const vueImports = [
    ...(hasNamedSlots ? ['cloneVNode'] : []),
    'defineComponent',
    ...(hasProps ? ['getCurrentInstance'] : []),
    'h',
    ...(hasEvents ? ['onBeforeUnmount'] : []),
    ...(hasProps || hasEvents ? ['onMounted'] : []),
    ...(hasProps ? ['onUpdated'] : []),
    'ref',
  ]

  return `
import {
  ${vueImports.join(',\n  ')},
} from 'vue';

import ${JSON.stringify(wcModuleId)};
${generateVueConstants(capabilities)}
export const ${component.name} = defineComponent({
  name: ${JSON.stringify(component.name)},
  inheritAttrs: false,
${hasProps ? `\n  props: {\n    ${generateVueProps(component)}\n  },\n` : ''}
${hasEvents ? `  emits: EVENT_NAMES,\n` : ''}
  setup(${hasProps ? 'props' : '_props'}, { attrs, slots${hasEvents ? ', emit' : ''} }) {
    const elRef = ref(null);
${generateVuePropSetup(hasProps)}
${generateVueEventSetup(hasEvents)}
${generateVueMountHook(hasProps, hasEvents)}
${hasProps ? '    onUpdated(syncProps);\n' : ''}
${generateVueUnmountHook(hasEvents)}
    return () => {
${generateVueChildren(slotNames)}
      const hostProps = Object.assign({}, attrs);
      hostProps.ref = elRef;

      return h(${JSON.stringify(component.tag)}, hostProps, children);
    };
  },
});
${hasProps ? VUE_PROP_HELPERS : ''}
${hasNamedSlots ? VUE_NAMED_SLOT_HELPERS : ''}
`.trimStart()
}

function getCapabilities(component: ComponentRecord): WrapperCapabilities {
  return {
    propNames: Object.keys(component.props),
    eventNames: Object.entries(component.events).map(([key, event]) => {
      return event.name ?? toKebabCase(event.key ?? key)
    }),
    slotNames: getNamedSlots(component),
  }
}

function getNamedSlots(component: ComponentRecord): string[] {
  return Object.keys(component.slots).filter(name => name !== 'default')
}

function generateVueConstants(capabilities: WrapperCapabilities): string {
  const { eventNames, propNames, slotNames } = capabilities
  const lines: string[] = []

  if (propNames.length) {
    lines.push(`const PROP_KEYS = ${JSON.stringify(propNames)};`)
    lines.push(
      `const PROP_INPUT_KEYS = ${JSON.stringify(createVuePropInputKeys(propNames))};`,
    )
    lines.push('const EMPTY_PROPS = {};')
  }

  if (eventNames.length) {
    lines.push(`const EVENT_NAMES = ${JSON.stringify(eventNames)};`)
  }

  if (slotNames.length) {
    lines.push(`const NAMED_SLOTS = ${JSON.stringify(slotNames)};`)
  }

  return lines.length ? `${lines.join('\n')}\n` : ''
}

function generateVuePropSetup(hasProps: boolean): string {
  if (!hasProps) return ''

  return `    const instance = getCurrentInstance();
    const syncedPropPresence = [];
    const syncedPropValues = [];

    const syncProps = () => {
      const el = elRef.value;
      if (!el) return;

      const rawProps = instance?.vnode.props || EMPTY_PROPS;

      for (let index = 0; index < PROP_KEYS.length; index += 1) {
        const name = PROP_KEYS[index];

        if (hasRawProp(rawProps, name)) {
          const nextValue = props[name];
          if (
            !syncedPropPresence[index] ||
            !Object.is(syncedPropValues[index], nextValue)
          ) {
            el[name] = nextValue;
            syncedPropValues[index] = nextValue;
          }
          syncedPropPresence[index] = true;
        } else if (syncedPropPresence[index]) {
          el[name] = undefined;
          syncedPropPresence[index] = false;
          syncedPropValues[index] = undefined;
        }
      }
    };
`
}

function generateVueEventSetup(hasEvents: boolean): string {
  if (!hasEvents) return ''

  return `    const eventHandlers = EVENT_NAMES.map(
      eventName => event => emit(eventName, event),
    );
    let mountedEl = null;
`
}

function generateVueMountHook(hasProps: boolean, hasEvents: boolean): string {
  if (!hasProps && !hasEvents) return ''

  const propSync = hasProps ? '      syncProps();\n' : ''
  const eventSetup = hasEvents
    ? `
      mountedEl = elRef.value;
      if (!mountedEl) return;

      for (let index = 0; index < EVENT_NAMES.length; index += 1) {
        mountedEl.addEventListener(EVENT_NAMES[index], eventHandlers[index]);
      }
`
    : ''

  return `    onMounted(() => {
${propSync}${eventSetup}    });
`
}

function generateVueUnmountHook(hasEvents: boolean): string {
  if (!hasEvents) return ''

  return `    onBeforeUnmount(() => {
      if (!mountedEl) return;

      for (let index = 0; index < EVENT_NAMES.length; index += 1) {
        mountedEl.removeEventListener(EVENT_NAMES[index], eventHandlers[index]);
      }
      mountedEl = null;
    });
`
}

function generateVueChildren(slotNames: string[]): string {
  if (!slotNames.length) {
    return `      const children = slots.default ? slots.default() : undefined;
`
  }

  return `      const children = slots.default ? slots.default() : [];

      for (const name of NAMED_SLOTS) {
        const slot = slots[name];
        if (!slot) continue;

        for (const vnode of slot()) {
          children.push(withSlot(name, vnode));
        }
      }
`
}

function generateVueProps(component: ComponentRecord): string {
  return Object.entries(component.props)
    .map(([name, prop]) => {
      return `${JSON.stringify(name)}: ${toVuePropOption(prop)}`
    })
    .join(',\n    ')
}

function toVuePropOption(prop: ComponentRecord['props'][string]): string {
  const typeMap: Record<string, string> = {
    string: 'String',
    number: 'Number',
    boolean: 'Boolean',
    object: 'Object',
    array: 'Array',
    function: 'Function',
    unknown: 'null',
  }

  return `{ type: ${typeMap[prop.type] ?? 'null'}, required: ${
    prop.required === true ? 'true' : 'false'
  } }`
}

function createVuePropInputKeys(propNames: string[]): Record<string, string[]> {
  return Object.fromEntries(
    propNames.map(name => [
      name,
      Array.from(new Set([name, toKebabCase(name)])),
    ]),
  )
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

const VUE_PROP_HELPERS = `
function hasRawProp(rawProps, name) {
  const keys = PROP_INPUT_KEYS[name];
  for (const key of keys) {
    if (hasOwn(rawProps, key)) return true;
  }
  return false;
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}
`

const VUE_NAMED_SLOT_HELPERS = `
function withSlot(name, vnode) {
  if (!vnode) return vnode;

  if (typeof vnode === 'string') {
    return h('span', { slot: name, style: 'display: contents' }, vnode);
  }

  return cloneVNode(vnode, { slot: name });
}
`
