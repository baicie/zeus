/* eslint-disable */
/* tslint:disable */
/* auto-generated vue proxies */
import { defineContainer, type StencilVueComponent } from '@stencil/vue-output-target/runtime';

import type { JSX } from '@zeus-js/example-stencil-wrapper';

import { defineCustomElement as defineZDemoButton } from '@zeus-js/example-stencil-wrapper/components/z-demo-button.js';
import { defineCustomElement as defineZDemoInput } from '@zeus-js/example-stencil-wrapper/components/z-demo-input.js';



export const ZDemoButton: StencilVueComponent<JSX.ZDemoButton> = /*@__PURE__*/ defineContainer<JSX.ZDemoButton>('z-demo-button', defineZDemoButton, [
  'disabled',
  'variant',
  'press'
], [
  'press'
]);


export const ZDemoInput: StencilVueComponent<JSX.ZDemoInput, JSX.ZDemoInput["value"]> = /*@__PURE__*/ defineContainer<JSX.ZDemoInput, JSX.ZDemoInput["value"]>('z-demo-input', defineZDemoInput, [
  'disabled',
  'formatter',
  'invalid',
  'maxLength',
  'meta',
  'placeholder',
  'value',
  'value-change',
  'focus-change'
], [
  'value-change',
  'focus-change'
],
'value', 'value-change', undefined);


