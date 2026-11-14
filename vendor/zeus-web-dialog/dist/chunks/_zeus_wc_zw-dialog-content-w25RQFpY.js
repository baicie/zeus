import { bootstrapLazy } from "@zeus-js/web-c-runtime";
//#region \0zeus:wc:zw-dialog-content
const components = [{
	tagName: "zw-dialog-content",
	shadow: false,
	formAssociated: false,
	load: () => import("../wc/zw-dialog-content.entry.js"),
	props: [{
		name: "forceMount",
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
