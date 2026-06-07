import type { ComponentRecord } from '@zeus-js/component-analyzer'

export interface GenerateReactWrapperOptions {
  component: ComponentRecord
  namedSlots: 'props' | 'none'
  wcModuleId: string
  mode?: 'runtime' | 'minimal' | 'event-bridge'
}

interface Binding {
  sourceName: string
  localName: string
}

interface EventBinding extends Binding {
  eventName: string
}

export function generateReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  return input.mode === 'runtime'
    ? generateRuntimeReactWrapper(input)
    : input.mode === 'event-bridge'
      ? generateEventBridgeReactWrapper(input)
      : generateMinimalReactWrapper(input)
}

function generateMinimalReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component, namedSlots, wcModuleId } = input
  const slotBindings = createBindings(
    getNamedSlots(component, namedSlots),
    'slotValue',
  )
  const omittedKeys = [
    'children',
    ...slotBindings.map(({ sourceName }) => sourceName),
  ]
  const slotAssignments = generatePropAssignments(slotBindings)
  const namedSlotLines = generateMinimalNamedSlots(slotBindings)
  const childSetup = slotBindings.length
    ? `${namedSlotLines}
    const childArgs = [];
    pushAll(childArgs, slotNodes);
    if (children != null) childArgs.push(children);`
    : ''
  const render = slotBindings.length
    ? `React.createElement.apply(
      React,
      [${JSON.stringify(component.tag)}, rest].concat(childArgs),
    )`
    : `React.createElement(${JSON.stringify(component.tag)}, rest, children)`

  return `
import * as React from 'react';

import ${JSON.stringify(wcModuleId)};

const OMITTED_PROPS = new Set(${JSON.stringify(omittedKeys)});

export const ${component.name} = React.forwardRef(
  function ${component.name}(inputProps, ref) {
    const props = inputProps || {};
    const children = props.children;
${slotAssignments}
    const rest = omitProps(props);
    rest.ref = ref;
${childSetup}

    return ${render};
  },
);

function omitProps(source) {
  const output = {};
  for (const key in source) {
    if (hasOwn(source, key) && !OMITTED_PROPS.has(key)) {
      output[key] = source[key];
    }
  }
  return output;
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}
${slotBindings.length ? PUSH_ALL_HELPER : ''}
`.trimStart()
}

function generateEventBridgeReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component, namedSlots, wcModuleId } = input
  const propBindings = createBindings(Object.keys(component.props), 'propValue')
  const eventBindings = createEventBindings(component.events)

  if (!propBindings.length && !eventBindings.length) {
    return generateMinimalReactWrapper(input)
  }

  const slotBindings = createBindings(
    getNamedSlots(component, namedSlots),
    'slotValue',
  )
  const destructuredBindings = [
    ...propBindings,
    ...eventBindings,
    ...slotBindings,
  ]
  const omittedKeys = [
    'children',
    'className',
    'style',
    ...destructuredBindings.map(({ sourceName }) => sourceName),
  ]
  const reactImports = [
    'createElement',
    ...(slotBindings.length
      ? ['cloneElement', 'Fragment', 'isValidElement']
      : []),
    'forwardRef',
    ...(propBindings.length || eventBindings.length ? ['useEffect'] : []),
    'useImperativeHandle',
    'useRef',
  ]

  return `
import {
  ${reactImports.join(',\n  ')},
} from 'react';

import ${JSON.stringify(wcModuleId)};

const OMITTED_PROPS = new Set(${JSON.stringify(omittedKeys)});
${eventBindings.length ? `const EVENT_NAMES = ${JSON.stringify(eventBindings.map(binding => binding.eventName))};` : ''}

export const ${component.name} = forwardRef(function ${component.name}(inputProps, ref) {
  const props = inputProps || {};
  const children = props.children;
  const className = props.className;
  const style = props.style;
${generatePropAssignments(destructuredBindings)}
${generatePropPresenceAssignments(propBindings)}
  const rest = omitProps(props);

  const innerRef = useRef(null);
${generatePropRefs(propBindings)}
${generateEventRefs(eventBindings)}
  useImperativeHandle(ref, () => innerRef.current, []);

${generatePropSyncEffect(propBindings)}
${generateEventEffect(eventBindings)}
${generateChildrenSetup(slotBindings)}
  rest.ref = innerRef;
  rest.className = className;
  rest.style = style;

  return ${generateReactRender(component.tag, slotBindings)};
});
${slotBindings.length ? NAMED_SLOT_HELPER : ''}
function omitProps(source) {
  const output = {};
  for (const key in source) {
    if (hasOwn(source, key) && !OMITTED_PROPS.has(key)) {
      output[key] = source[key];
    }
  }
  return output;
}

function hasOwn(source, key) {
  return Object.prototype.hasOwnProperty.call(source, key);
}
`.trimStart()
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
  return Object.entries(events).map(([key, event], index) => {
    const sourceEventName = event.key ?? key

    return {
      eventName: event.name ?? toKebabCase(sourceEventName),
      sourceName: event.reactName ?? toReactEventProp(sourceEventName),
      localName: `eventHandler${index}`,
    }
  })
}

function generatePropAssignments(bindings: Binding[]): string {
  return bindings
    .map(
      ({ sourceName, localName }) =>
        `  const ${localName} = props[${JSON.stringify(sourceName)}];`,
    )
    .join('\n')
}

function generatePropPresenceAssignments(bindings: Binding[]): string {
  return bindings
    .map(
      ({ sourceName }, index) =>
        `  const propPresent${index} = hasOwn(props, ${JSON.stringify(sourceName)});`,
    )
    .join('\n')
}

function generatePropRefs(bindings: Binding[]): string {
  if (!bindings.length) return ''

  return `  const previousPropPresenceRef = useRef([]);
  const previousPropValuesRef = useRef([]);`
}

function generateEventRefs(bindings: EventBinding[]): string {
  if (!bindings.length) return ''

  return `  const eventHandlersRef = useRef([]);
${bindings
  .map(
    ({ localName }, index) =>
      `  eventHandlersRef.current[${index}] = ${localName};`,
  )
  .join('\n')}`
}

function generatePropSyncEffect(bindings: Binding[]): string {
  if (!bindings.length) return ''

  const syncLines = bindings
    .map(({ sourceName, localName }, index) => {
      const key = JSON.stringify(sourceName)

      return `    if (propPresent${index}) {
      if (
        !previousPropPresence[${index}] ||
        !Object.is(previousPropValues[${index}], ${localName})
      ) {
        el[${key}] = ${localName};
        previousPropValues[${index}] = ${localName};
      }
      previousPropPresence[${index}] = true;
    } else if (previousPropPresence[${index}]) {
      el[${key}] = undefined;
      previousPropPresence[${index}] = false;
      previousPropValues[${index}] = undefined;
    }`
    })
    .join('\n\n')
  const dependencies = bindings.flatMap((binding, index) => [
    `propPresent${index}`,
    binding.localName,
  ])

  return `  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const previousPropPresence = previousPropPresenceRef.current;
    const previousPropValues = previousPropValuesRef.current;

${syncLines}
  }, [${dependencies.join(', ')}]);
`
}

function generateEventEffect(bindings: EventBinding[]): string {
  if (!bindings.length) return ''

  return `  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;

    const listeners = EVENT_NAMES.map(
      (_eventName, index) => event => {
        const handler = eventHandlersRef.current[index];
        if (handler) handler(event);
      },
    );

    for (let index = 0; index < EVENT_NAMES.length; index += 1) {
      el.addEventListener(EVENT_NAMES[index], listeners[index]);
    }

    return () => {
      for (let index = 0; index < EVENT_NAMES.length; index += 1) {
        el.removeEventListener(EVENT_NAMES[index], listeners[index]);
      }
    };
  }, []);
`
}

function generateChildrenSetup(bindings: Binding[]): string {
  if (!bindings.length) return ''

  return `  const slotChildren = [];
${bindings
  .map(
    ({ sourceName, localName }) => `  {
    const node = createNamedSlot(${JSON.stringify(sourceName)}, ${localName});
    if (node != null) slotChildren.push(node);
  }`,
  )
  .join('\n')}
  if (children != null) slotChildren.push(children);
`
}

function generateReactRender(tag: string, slotBindings: Binding[]): string {
  if (!slotBindings.length) {
    return `createElement(${JSON.stringify(tag)}, rest, children)`
  }

  return `createElement.apply(
    null,
    [${JSON.stringify(tag)}, rest].concat(slotChildren),
  )`
}

function getNamedSlots(
  component: ComponentRecord,
  namedSlots: 'props' | 'none',
): string[] {
  return namedSlots === 'none'
    ? []
    : Object.keys(component.slots).filter(name => name !== 'default')
}

function generateMinimalNamedSlots(bindings: Binding[]): string {
  if (!bindings.length) return ''

  const lines = bindings.map(({ sourceName, localName }, index) => {
    return `    const slotNode${index} = ${localName} != null && ${localName} !== false
      ? (React.isValidElement(${localName}) && ${localName}.type !== React.Fragment
          ? React.cloneElement(${localName}, { slot: ${JSON.stringify(sourceName)} })
          : React.createElement('span', { slot: ${JSON.stringify(sourceName)}, style: { display: 'contents' } }, ${localName}))
      : null;`
  })

  return `${lines.join('\n')}
    const slotNodes = [${bindings.map((_, index) => `slotNode${index}`).join(', ')}].filter(Boolean);`
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

function generateRuntimeReactWrapper(
  input: GenerateReactWrapperOptions,
): string {
  const { component } = input
  const events = createRuntimeEventMap(component)

  return [
    `import React from 'react'`,
    `import { createComponent } from '@zeus-js/output-react-wrapper/runtime'`,
    `import { defineCustomElement } from '../wc/loader.js'`,
    ``,
    `export const ${component.name} = createComponent({`,
    `  react: React,`,
    `  tagName: ${JSON.stringify(component.tag)},`,
    `  defineCustomElement: () => defineCustomElement(${JSON.stringify(
      component.tag,
    )}),`,
    `  events: ${formatEventObject(events)},`,
    `  displayName: ${JSON.stringify(component.name)},`,
    `})`,
    ``,
  ].join('\n')
}

function createRuntimeEventMap(
  component: ComponentRecord,
): Record<string, string> {
  const events: Record<string, string> = {}

  for (const [key, event] of Object.entries(component.events)) {
    const sourceEventName = event.key ?? key
    const domEventName = event.name ?? toKebabCase(sourceEventName)
    const reactPropName = event.reactName ?? toReactEventProp(sourceEventName)

    events[reactPropName] = domEventName
  }

  return events
}

function formatEventObject(value: Record<string, string>): string {
  const entries = Object.entries(value)

  if (!entries.length) {
    return '{}'
  }

  return `{\n${entries
    .map(([key, item]) => `    ${JSON.stringify(key)}: ${JSON.stringify(item)}`)
    .join(',\n')}\n  }`
}

const PUSH_ALL_HELPER = `
function pushAll(target, values) {
  for (const value of values) target.push(value);
}
`

const NAMED_SLOT_HELPER = `
function createNamedSlot(name, value) {
  if (value == null || value === false) return null;

  if (isValidElement(value) && value.type !== Fragment) {
    return cloneElement(value, { slot: name });
  }

  return createElement(
    'span',
    { slot: name, style: { display: 'contents' } },
    value,
  );
}
`
