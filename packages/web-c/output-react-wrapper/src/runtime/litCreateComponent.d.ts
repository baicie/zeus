import type {
  EventName,
  ReactModule,
  ZeusReactComponent,
} from './createComponent'

type EventNames = Record<string, EventName | string>

export declare const createComponent: <
  I extends HTMLElement,
  E extends EventNames = {},
>(options: {
  react: ReactModule
  tagName: string
  elementClass: { new (): I }
  events?: E
  displayName?: string
}) => ZeusReactComponent<I, E>
