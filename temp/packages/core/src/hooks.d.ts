interface Ref<T extends Element> {
    current: T | null;
    __ref: string;
}
export declare function useRef<T extends Element>(name: string): Ref<T>;
interface EventHandler<T extends Event> {
    __event: string;
    handler: (e: T) => void;
}
export declare function useEvent<T extends Event>(name: string, handler: (e: T) => void): EventHandler<T>;
export {};
