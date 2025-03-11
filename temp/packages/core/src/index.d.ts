export { ZeusElement } from './base';
export { useRef, useEvent } from './hooks';
export interface ComponentOptions {
    tag: string;
    shadow?: boolean;
}
export declare function Component(options: ComponentOptions): (target: Function) => Function;
