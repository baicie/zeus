import type { JSX } from './jsx';
interface ForProps<T> {
    each: T[];
    fallback?: JSX.Element;
    children: (item: T, index: number) => JSX.Element;
}
export declare function For<T>(props: ForProps<T>): JSX.Element;
interface ShowProps {
    when: boolean;
    fallback?: JSX.Element;
    children: JSX.Element | (() => JSX.Element);
}
export declare function Show(props: ShowProps): JSX.Element;
export {};
