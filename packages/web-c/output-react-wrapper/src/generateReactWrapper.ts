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

function generateMinimalReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component, namedSlots, wcModuleId } = input

  const slotNames = getNamedSlots(component, namedSlots)
  const slotDestructure = slotNames.length
    ? `\n    ${slotNames.join(',\n    ')},`
    : ''

  const namedSlotLines = generateMinimalNamedSlots(slotNames)

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

  const propNames = Object.keys(component.props)
  const eventNames = Object.keys(component.events)
  const slotNames = getNamedSlots(component, namedSlots)

  const eventPropNames = eventNames.map(toReactEventProp)
  const destructuredPropNames = [...propNames, ...eventPropNames, ...slotNames]
  const destructuredProps = destructuredPropNames.length
    ? `${destructuredPropNames.join(',\n    ')},`
    : ''

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

const PROP_KEYS = ${JSON.stringify(propNames)};
const EVENT_MAP = ${JSON.stringify(createReactEventMap(eventNames))};
const NAMED_SLOTS = ${JSON.stringify(slotNames)};

export const ${component.name} = forwardRef(function ${component.name}(props, ref) {
  const {
    children,
    className,
    style,
    ${destructuredProps}
    ...rest
  } = props;

  const innerRef = useRef(null);

  useImperativeHandle(ref, () => innerRef.current);

  ${generatePropSyncLines(propNames)}

  ${generateEventEffects(eventNames)}

  const slotChildren = [];

  ${generateNamedSlotRenderLines(slotNames)}

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

function generatePropSyncLines(propNames: string[]): string {
  if (!propNames.length) {
    return '// no props'
  }

  return `useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    ${propNames.map(name => `el.${name} = ${name};`).join('\n    ')}
  }, [${propNames.join(', ')}]);`
}

function generateEventEffects(eventNames: string[]): string {
  return eventNames
    .map(eventName => {
      const propName = toReactEventProp(eventName)

      return `
  useEffect(() => {
    const el = innerRef.current;
    if (!el || !${propName}) return;

    const handler = event => {
      ${propName}(event);
    };

    el.addEventListener(${JSON.stringify(eventName)}, handler);

    return () => {
      el.removeEventListener(${JSON.stringify(eventName)}, handler);
    };
  }, [${propName}]);
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

function generateNamedSlotRenderLines(namedSlots: string[]): string {
  return namedSlots
    .map(name => {
      return `
  {
    const node = createNamedSlot(${JSON.stringify(name)}, ${name});
    if (node != null) slotChildren.push(node);
  }
`
    })
    .join('')
}

function generateMinimalNamedSlots(namedSlots: string[]): string {
  if (!namedSlots.length) return ''

  return (
    namedSlots
      .map(name => {
        return `    const slotNode_${name} = ${name} != null && ${name} !== false
      ? (React.isValidElement(${name}) && ${name}.type !== React.Fragment
          ? React.cloneElement(${name}, { slot: ${JSON.stringify(name)} })
          : React.createElement('span', { slot: ${JSON.stringify(name)}, style: { display: 'contents' } }, ${name}))
      : null;
`
      })
      .join('') +
    '\n    const slotNodes = [' +
    namedSlots.map(name => `slotNode_${name}`).join(', ') +
    '].filter(Boolean);\n'
  )
}
