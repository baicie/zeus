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

function createEventBindings(
  events: ComponentRecord['events'],
): EventBinding[] {
  return Object.keys(events).map((key, index) => ({
    eventName: events[key].name ?? toKebabCase(events[key].key ?? key),
    sourceName:
      events[key].reactName ?? toReactEventProp(events[key].key ?? key),
    localName: `eventHandler${index}`,
  }))
}

function generateMinimalReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component, namedSlots, wcModuleId } = input

  const slotNames = getNamedSlots(component, namedSlots)
  const slotBindings = createBindings(slotNames, 'slotValue')

  const omittedKeys = [
    'children',
    ...slotBindings.map(({ sourceName }) => sourceName),
  ]
  const slotAssignments = generatePropAssignments(slotBindings)

  const namedSlotLines = generateMinimalNamedSlots(slotBindings)

  return `
import * as React from 'react';

import ${JSON.stringify(wcModuleId)};

export const ${component.name} = React.forwardRef(
  function ${component.name}(inputProps, ref) {
    const props = inputProps || {};
    const children = props.children;
${slotAssignments}
    const rest = omitProps(props, ${JSON.stringify(omittedKeys)});
${namedSlotLines}
    const childArgs = [];
${namedSlotLines ? '    pushAll(childArgs, slotNodes);\n' : ''}    if (children != null) childArgs.push(children);

    return React.createElement.apply(
      React,
      [
        ${JSON.stringify(component.tag)},
        Object.assign({}, rest, { ref: ref }),
      ].concat(childArgs),
    );
  },
);

function omitProps(source, keys) {
  const output = {};
  for (const key in source) {
    if (
      Object.prototype.hasOwnProperty.call(source, key) &&
      keys.indexOf(key) === -1
    ) {
      output[key] = source[key];
    }
  }
  return output;
}

function pushAll(target, values) {
  for (const value of values) {
    target.push(value);
  }
}
`.trimStart()
}

function generateEventBridgeReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component, namedSlots, wcModuleId } = input

  const propBindings = createBindings(Object.keys(component.props), 'propValue')

  const eventBindings = createEventBindings(component.events)

  const slotBindings = createBindings(
    getNamedSlots(component, namedSlots),
    'slotValue',
  )

  const destructuredBindings = [
    ...propBindings,
    ...eventBindings,
    ...slotBindings,
  ]
  const propAssignments = generatePropAssignments(destructuredBindings)
  const omittedKeys = [
    'children',
    'className',
    'style',
    ...destructuredBindings.map(({ sourceName }) => sourceName),
  ]

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

export const ${component.name} = forwardRef(function ${component.name}(inputProps, ref) {
  const props = inputProps || {};
  const children = props.children;
  const className = props.className;
  const style = props.style;
${propAssignments}
  const rest = omitProps(props, ${JSON.stringify(omittedKeys)});

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

  return createElement.apply(
    null,
    [
      ${JSON.stringify(component.tag)},
      Object.assign({}, rest, {
        ref: innerRef,
        className: className,
        style: style,
      }),
    ].concat(slotChildren),
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

function omitProps(source, keys) {
  const output = {};
  for (const key in source) {
    if (
      Object.prototype.hasOwnProperty.call(source, key) &&
      keys.indexOf(key) === -1
    ) {
      output[key] = source[key];
    }
  }
  return output;
}
`.trimStart()
}

function generatePropAssignments(bindings: Binding[]): string {
  if (!bindings.length) return ''

  return bindings
    .map(({ sourceName, localName }) => {
      return `    const ${localName} = props[${JSON.stringify(sourceName)}];`
    })
    .join('\n')
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
    .map(({ eventName, localName }) => {
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

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function toReactEventProp(value: string): string {
  return `on${value
    .split('-')
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')}`
}
