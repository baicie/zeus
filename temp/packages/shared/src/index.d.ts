export declare const VERSION = "0.0.1";
export declare const isArray: (arg: any) => arg is any[];
export declare const isObject: (val: unknown) => val is Record<any, any>;
export declare const isFunction: (val: unknown) => val is Function;
export declare const createElement: (tag: string) => HTMLElement;
export declare const createTextNode: (text: string) => Text;
export declare const insert: (child: Node, parent: Node, anchor?: Node | null) => void;
