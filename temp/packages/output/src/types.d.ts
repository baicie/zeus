export interface OutputTarget {
    type: 'react' | 'vue' | 'angular' | 'web-components';
    outDir: string;
    componentCorePackage?: string;
    proxiesFile?: string;
}
export interface OutputOptions {
    targets: OutputTarget[];
    components: ComponentMeta[];
}
export interface ComponentMeta {
    tagName: string;
    className: string;
    properties: PropertyMeta[];
    events: EventMeta[];
    methods: MethodMeta[];
}
export interface PropertyMeta {
    name: string;
    type: string;
}
export interface EventMeta {
    name: string;
    eventName: string;
}
export interface MethodMeta {
    name: string;
    parameters: ParameterMeta[];
}
export interface ParameterMeta {
    name: string;
    type: string;
}
