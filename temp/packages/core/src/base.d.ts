export declare class ZeusElement extends HTMLElement {
    protected _root: ShadowRoot | HTMLElement;
    protected _refs: Map<string, Element>;
    constructor(shadow?: boolean);
    protected _setRef(name: string, el: Element): void;
    protected _emit(name: string, detail?: any): void;
    static get observedAttributes(): string[];
}
