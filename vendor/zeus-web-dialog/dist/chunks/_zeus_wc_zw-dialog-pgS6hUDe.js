import { bootstrapLazy } from "@zeus-js/web-c-runtime";
//#region \0zeus:wc:zw-dialog
const components = [{
	tagName: "zw-dialog",
	shadow: false,
	formAssociated: false,
	load: () => import("../wc/zw-dialog.entry.js"),
	props: [
		{
			name: "open",
			type: "boolean",
			reflect: true
		},
		{
			name: "defaultOpen",
			type: "boolean",
			default: false,
			reflect: true
		},
		{
			name: "modal",
			type: "boolean",
			default: true,
			reflect: true
		},
		{
			name: "closeOnOutsideClick",
			type: "boolean",
			default: true,
			reflect: true
		}
	],
	methods: ["show", "close"]
}];
const component = components[0];
function defineCustomElement(options = {}) {
	bootstrapLazy([component], options);
}
//#endregion
export { components as n, defineCustomElement as r, component as t };
