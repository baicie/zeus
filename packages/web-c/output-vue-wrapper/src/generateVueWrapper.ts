import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateVueWrapperOptions {
  component: ComponentRecord
  wcModuleId: string
  mode?: 'minimal' | 'event-bridge'
}

export function generateVueWrapper(input: GenerateVueWrapperOptions): string {
  const { mode = 'minimal' } = input

  if (mode === 'minimal') {
    return generateMinimalVueWrapper(input)
  }

  return generateEventBridgeVueWrapper(input)
}

function generateMinimalVueWrapper(input: GenerateVueWrapperOptions): string {
  const { component, wcModuleId } = input

  const slotNames = Object.keys(component.slots).filter(
    name => name !== 'default',
  )

  const hasNamedSlots = slotNames.length > 0

  const vueImports = hasNamedSlots
    ? `cloneVNode, defineComponent, h`
    : `defineComponent, h`

  const namedSlotBlock = hasNamedSlots
    ? `
      for (const name of NAMED_SLOTS) {
        const slot = slots[name];
        if (!slot) continue;

        for (const vnode of slot()) {
          children.push(withSlot(name, vnode));
        }
      }
`
    : ''

  const withSlotHelper = hasNamedSlots
    ? `
function withSlot(name, vnode) {
  if (!vnode) return vnode;

  if (typeof vnode === 'string') {
    return h('span', { slot: name, style: 'display: contents' }, vnode);
  }

  return cloneVNode(vnode, { slot: name });
}
`
    : ''

  return `
import { ${vueImports} } from 'vue';

import ${JSON.stringify(wcModuleId)};

const NAMED_SLOTS = ${JSON.stringify(slotNames)};

export const ${component.name} = defineComponent({
  name: ${JSON.stringify(component.name)},
  inheritAttrs: false,

  setup(_props, { attrs, slots }) {
    return () => {
      const children = [];

      if (slots.default) {
        children.push(...slots.default());
      }
${namedSlotBlock}
      return h(
        ${JSON.stringify(component.tag)},
        {
          ...attrs,
        },
        children,
      );
    };
  },
});
${withSlotHelper}
`.trimStart()
}

function generateEventBridgeVueWrapper(
  input: GenerateVueWrapperOptions,
): string {
  const { component, wcModuleId } = input

  const propNames = Object.keys(component.props)
  const eventNames = Object.keys(component.events)
  const slotNames = Object.keys(component.slots).filter(
    name => name !== 'default',
  )
  const propInputKeys = createVuePropInputKeys(propNames)

  return `
import {
  cloneVNode,
  defineComponent,
  getCurrentInstance,
  h,
  onBeforeUnmount,
  onMounted,
  onUpdated,
  ref,
} from 'vue';

import ${JSON.stringify(wcModuleId)};

const PROP_KEYS = ${JSON.stringify(propNames)};
const PROP_INPUT_KEYS = ${JSON.stringify(propInputKeys)};
const EVENT_NAMES = ${JSON.stringify(eventNames)};
const NAMED_SLOTS = ${JSON.stringify(slotNames)};

export const ${component.name} = defineComponent({
  name: ${JSON.stringify(component.name)},
  inheritAttrs: false,

  props: {
    ${generateVueProps(component)}
  },

  emits: EVENT_NAMES,

  setup(props, { attrs, slots, emit }) {
    const elRef = ref(null);
    const instance = getCurrentInstance();
    const cleanups = [];
    const syncedPropKeys = new Set();

    const hasRawProp = name => {
      const rawProps = instance?.vnode.props ?? {};
      const keys = PROP_INPUT_KEYS[name] ?? [name];

      return keys.some(key =>
        Object.prototype.hasOwnProperty.call(rawProps, key),
      );
    };

    const syncProps = () => {
      const el = elRef.value;
      if (!el) return;

      for (const name of PROP_KEYS) {
        if (hasRawProp(name)) {
          el[name] = props[name];
          syncedPropKeys.add(name);
          continue;
        }

        if (syncedPropKeys.has(name)) {
          el[name] = undefined;
          syncedPropKeys.delete(name);
        }
      }
    };

    onMounted(() => {
      syncProps();

      const el = elRef.value;
      if (!el) return;

      for (const eventName of EVENT_NAMES) {
        const handler = event => emit(eventName, event);
        el.addEventListener(eventName, handler);
        cleanups.push(() => el.removeEventListener(eventName, handler));
      }
    });

    onUpdated(syncProps);

    onBeforeUnmount(() => {
      for (const cleanup of cleanups) cleanup();
      cleanups.length = 0;
      syncedPropKeys.clear();
    });

    return () => {
      const children = [];

      if (slots.default) {
        children.push(...slots.default());
      }

      for (const name of NAMED_SLOTS) {
        const slot = slots[name];
        if (!slot) continue;

        for (const vnode of slot()) {
          children.push(withSlot(name, vnode));
        }
      }

      return h(
        ${JSON.stringify(component.tag)},
        {
          ...attrs,
          ref: elRef,
        },
        children,
      );
    };
  },
});

function withSlot(name, vnode) {
  if (!vnode) return vnode;

  if (typeof vnode === 'string') {
    return h('span', { slot: name, style: 'display: contents' }, vnode);
  }

  return cloneVNode(vnode, { slot: name });
}
`.trimStart()
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
    unknown: 'null',
  }

  const type = typeMap[prop.type] ?? 'null'
  const required = prop.required === true ? 'true' : 'false'

  return `{ type: ${type}, required: ${required} }`
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
