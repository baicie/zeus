import { bootstrapLazy } from "@zeus-js/web-c-runtime";
//#region \0zeus:wc:zw-dialog-trigger
const components = [{
	tagName: "zw-dialog-trigger",
	shadow: false,
	formAssociated: false,
	load: () => import("../wc/zw-dialog-trigger.entry.js"),
	props: [{
		name: "disabled",
		type: "boolean",
		default: false,
		reflect: true
	}],
	methods: ["focus"]
}];
const component = components[0];
function defineCustomElement(options = {}) {
	bootstrapLazy([component], options);
}
//#endregion
export { components as n, defineCustomElement as r, component as t };
