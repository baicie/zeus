import { bootstrapLazy } from "@zeus-js/web-c-runtime";
//#region \0zeus:wc:zw-dialog-overlay
const components = [{
	tagName: "zw-dialog-overlay",
	shadow: false,
	formAssociated: false,
	load: () => import("../wc/zw-dialog-overlay.entry.js"),
	props: [{
		name: "forceMount",
		type: "boolean",
		default: false,
		reflect: true
	}]
}];
const component = components[0];
function defineCustomElement(options = {}) {
	bootstrapLazy([component], options);
}
//#endregion
export { components as n, defineCustomElement as r, component as t };
