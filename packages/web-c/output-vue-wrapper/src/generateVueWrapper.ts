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

  const syncPropsBody = generateVuePropSyncLines(propNames)
  const watchDeps = propNames.map(name => `props.${name}`).join(', ')
  const watchBlock =
    propNames.length > 0
      ? `watch(() => [${watchDeps}], syncProps);`
      : `// no reactive props`

  return `
import {
  cloneVNode,
  defineComponent,
  h,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';

import ${JSON.stringify(wcModuleId)};

const PROP_KEYS = ${JSON.stringify(propNames)};
const EVENT_NAMES = ${JSON.stringify(eventNames)};
const NAMED_SLOTS = ${JSON.stringify(slotNames)};

export const ${component.name} = defineComponent({
  name: ${JSON.stringify(component.name)},

  props: {
    ${generateVueProps(component)}
  },

  emits: EVENT_NAMES,

  setup(props, { attrs, slots, emit }) {
    const elRef = ref(null);
    const cleanups = [];

    const syncProps = () => {
      const el = elRef.value;
      if (!el) return;

      ${syncPropsBody}
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

    onBeforeUnmount(() => {
      for (const cleanup of cleanups) cleanup();
      cleanups.length = 0;
    });

    ${watchBlock}

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

  if (prop.default !== undefined) {
    return `{ type: ${type}, default: ${JSON.stringify(prop.default)} }`
  }

  return `{ type: ${type}, required: ${prop.required === true ? 'true' : 'false'} }`
}

function generateVuePropSyncLines(propNames: string[]): string {
  if (propNames.length === 0) {
    return '// no props to sync'
  }

  return propNames.map(name => `el.${name} = props.${name};`).join('\n      ')
}
