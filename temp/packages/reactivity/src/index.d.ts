export interface Signal<T> {
    (): T;
    set: (value: T) => void;
}
export interface Computed<T> {
    (): T;
}
export declare function createSignal<T>(value: T): Signal<T>;
export declare function createMemo<T>(fn: () => T): Computed<T>;
export declare function createEffect(fn: () => void): void;
