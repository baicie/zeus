import { bootstrapLazy } from "@zeus-js/web-c-runtime";
//#region \0zeus:wc:zw-dialog-title
const components = [{
	tagName: "zw-dialog-title",
	shadow: false,
	formAssociated: false,
	load: () => import("../wc/zw-dialog-title.entry.js"),
	props: []
}];
const component = components[0];
function defineCustomElement(options = {}) {
	bootstrapLazy([component], options);
}
//#endregion
export { components as n, defineCustomElement as r, component as t };
