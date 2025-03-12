import type { PluginItem } from '@babel/core';
export interface JSXPluginOptions {
    mode?: 'dom' | 'ssr';
    dev?: boolean;
}
export declare function createJSXPlugin(options?: JSXPluginOptions): PluginItem;
