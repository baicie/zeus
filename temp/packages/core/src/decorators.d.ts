export interface ComponentOptions {
    tag: string;
    shadow?: boolean;
}
export declare function Component(options: ComponentOptions): (target: Function) => Function;
export declare function Prop(options?: {
    attribute?: string;
}): (target: any, propertyKey: string) => void;
export declare function Event(eventName?: string): (target: any, propertyKey: string) => void;
export declare function Method(): (target: any, propertyKey: string) => void;
