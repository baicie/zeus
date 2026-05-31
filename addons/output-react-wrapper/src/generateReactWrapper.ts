import { toReactEventProp } from './naming'

import type { OutputReactWrapperOptions } from './types'
import type { ComponentRecord } from '@zeus-js/component-analyzer'

export type RequiredOutputReactWrapperOptions = Required<
  Omit<OutputReactWrapperOptions, 'fileName'>
> & {
  fileName?: (tag: string) => string
}

export interface GenerateReactWrapperOptions {
  component: ComponentRecord
  options: RequiredOutputReactWrapperOptions
}

export function generateReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component, options } = input

  const wcImport = `zeus:wc:${component.tag}`
  const propNames = Object.keys(component.props)
  const eventNames = Object.keys(component.events)
  const namedSlots = getNamedSlots(component, options)

  const eventPropNames = eventNames.map(toReactEventProp)
  const namedSlotPropNames = namedSlots

  return `
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react';

import ${JSON.stringify(wcImport)};

const PROP_KEYS = ${JSON.stringify(propNames)};
const EVENT_MAP = ${JSON.stringify(createReactEventMap(eventNames))};
const NAMED_SLOTS = ${JSON.stringify(namedSlots)};

export const ${component.name} = forwardRef(function ${component.name}(props, ref) {
  const {
    children,
    className,
    style,
    ${[...propNames, ...eventPropNames, ...namedSlotPropNames].join(',\n    ')}
    ,
    ...rest
  } = props;

  const innerRef = useRef(null);

  useImperativeHandle(ref, () => innerRef.current);

  ${generatePropSyncLines(propNames)}

  ${generateEventEffects(eventNames)}

  const slotChildren = [];

  ${generateNamedSlotRenderLines(namedSlots)}

  if (children != null) {
    slotChildren.push(children);
  }

  return React.createElement(
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
    React.isValidElement(value) &&
    value.type !== React.Fragment
  ) {
    return React.cloneElement(value, { slot: name });
  }

  return React.createElement(
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

    ${propNames.map(name => `if (${name} !== undefined) el.${name} = ${name}; else el.${name} = undefined;`).join('\n    ')}
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
  options: RequiredOutputReactWrapperOptions,
): string[] {
  if (options.namedSlots === 'none') return []

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
