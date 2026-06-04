import { toReactEventProp } from './naming'

import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateReactWrapperOptions {
  component: ComponentRecord
  namedSlots: 'props' | 'none'
  wcModuleId: string
  mode?: 'minimal' | 'event-bridge'
}

export function generateReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { mode = 'minimal' } = input

  if (mode === 'minimal') {
    return generateMinimalReactWrapper(input)
  }

  return generateEventBridgeReactWrapper(input)
}

interface Binding {
  sourceName: string
  localName: string
}

interface EventBinding extends Binding {
  eventName: string
}

function createBindings(names: string[], prefix: string): Binding[] {
  return names.map((sourceName, index) => ({
    sourceName,
    localName: `${prefix}${index}`,
  }))
}

function createEventBindings(eventNames: string[]): EventBinding[] {
  return eventNames.map((eventName, index) => ({
    eventName,
    sourceName: toReactEventProp(eventName),
    localName: `eventHandler${index}`,
  }))
}

function generateDestructuredBindings(bindings: Binding[]): string {
  if (!bindings.length) return ''

  return bindings
    .map(({ sourceName, localName }) => {
      return `${JSON.stringify(sourceName)}: ${localName},`
    })
    .join('\n    ')
}

function generateMinimalReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component, namedSlots, wcModuleId } = input

  const slotNames = getNamedSlots(component, namedSlots)
  const slotBindings = createBindings(slotNames, 'slotValue')

  const slotDestructure = slotBindings.length
    ? `\n    ${generateDestructuredBindings(slotBindings)}`
    : ''

  const namedSlotLines = generateMinimalNamedSlots(slotBindings)

  return `
import * as React from 'react';

import ${JSON.stringify(wcModuleId)};

export const ${component.name} = React.forwardRef(
  function ${component.name}({
    children,${slotDestructure}
    ...rest
  } = {}, ref) {
${namedSlotLines}
    return React.createElement(
      ${JSON.stringify(component.tag)},
      {
        ...rest,
        ref,
      },
${namedSlotLines ? '      ...slotNodes,\n' : ''}      children,
    );
  },
);
`.trimStart()
}

function generateEventBridgeReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component, namedSlots, wcModuleId } = input

  const propBindings = createBindings(Object.keys(component.props), 'propValue')

  const eventBindings = createEventBindings(Object.keys(component.events))

  const slotBindings = createBindings(
    getNamedSlots(component, namedSlots),
    'slotValue',
  )

  const destructuredBindings = [
    ...propBindings,
    ...eventBindings,
    ...slotBindings,
  ]
  const destructuredProps = generateDestructuredBindings(destructuredBindings)

  return `
import {
  createElement,
  cloneElement,
  Fragment,
  forwardRef,
  isValidElement,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import ${JSON.stringify(wcModuleId)};

const PROP_KEYS = ${JSON.stringify(Object.keys(component.props))};
const EVENT_MAP = ${JSON.stringify(createReactEventMap(Object.keys(component.events)))};
const NAMED_SLOTS = ${JSON.stringify(getNamedSlots(component, namedSlots))};

export const ${component.name} = forwardRef(function ${component.name}(props, ref) {
  const {
    children,
    className,
    style,
    ${destructuredProps}
    ...rest
  } = props;

  const innerRef = useRef(null);
  const previousPropKeysRef = useRef(new Set());

  useImperativeHandle(ref, () => innerRef.current);

  ${generatePropSyncLines(propBindings)}

  ${generateEventEffects(eventBindings)}

  const slotChildren = [];

  ${generateNamedSlotRenderLines(slotBindings)}

  if (children != null) {
    slotChildren.push(children);
  }

  return createElement(
    ${JSON.stringify(component.tag)},
    {
      ...rest,
      ref: innerRef,
      className,
      style,
    },
    ...slotChildren,
  );
});

function createNamedSlot(name, value) {
  if (value == null || value === false) return null;

  if (
    isValidElement(value) &&
    value.type !== Fragment
  ) {
    return cloneElement(value, { slot: name });
  }

  return createElement(
    'span',
    {
      slot: name,
      style: { display: 'contents' },
    },
    value,
  );
}
`.trimStart()
}

function createReactEventMap(eventNames: string[]): Record<string, string> {
  const map: Record<string, string> = {}

  for (const eventName of eventNames) {
    map[toReactEventProp(eventName)] = eventName
  }

  return map
}

function generatePropSyncLines(bindings: Binding[]): string {
  if (!bindings.length) {
    return '// no props'
  }

  return `useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const previousPropKeys = previousPropKeysRef.current;

    ${bindings
      .map(({ sourceName, localName }) => {
        const key = JSON.stringify(sourceName)

        return `if (Object.prototype.hasOwnProperty.call(props, ${key})) {
      el[${key}] = ${localName};
      previousPropKeys.add(${key});
    } else if (previousPropKeys.has(${key})) {
      el[${key}] = undefined;
      previousPropKeys.delete(${key});
    }`
      })
      .join('\n\n    ')}
  }, [props, ${bindings.map(binding => binding.localName).join(', ')}]);`
}

function generateEventEffects(bindings: EventBinding[]): string {
  return bindings
    .map(({ eventName, sourceName, localName }) => {
      return `
  useEffect(() => {
    const el = innerRef.current;
    if (!el || !${localName}) return;

    const handler = event => {
      ${localName}(event);
    };

    el.addEventListener(${JSON.stringify(eventName)}, handler);

    return () => {
      el.removeEventListener(${JSON.stringify(eventName)}, handler);
    };
  }, [${localName}]);
`
    })
    .join('')
}

function getNamedSlots(
  component: ComponentRecord,
  namedSlots: 'props' | 'none',
): string[] {
  if (namedSlots === 'none') return []

  return Object.keys(component.slots).filter(name => name !== 'default')
}

function generateNamedSlotRenderLines(bindings: Binding[]): string {
  return bindings
    .map(({ sourceName, localName }) => {
      return `
  {
    const node = createNamedSlot(${JSON.stringify(sourceName)}, ${localName});
    if (node != null) slotChildren.push(node);
  }
`
    })
    .join('')
}

function generateMinimalNamedSlots(bindings: Binding[]): string {
  if (!bindings.length) return ''

  const lines = bindings.map(({ sourceName, localName }, index) => {
    const nodeName = `slotNode${index}`

    return `    const ${nodeName} = ${localName} != null && ${localName} !== false
      ? (React.isValidElement(${localName}) && ${localName}.type !== React.Fragment
          ? React.cloneElement(${localName}, { slot: ${JSON.stringify(sourceName)} })
          : React.createElement('span', { slot: ${JSON.stringify(sourceName)}, style: { display: 'contents' } }, ${localName}))
      : null;
`
  })

  return (
    lines.join('') +
    '\n    const slotNodes = [' +
    bindings.map((_, index) => `slotNode${index}`).join(', ') +
    '].filter(Boolean);\n'
  )
}
