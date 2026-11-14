import { bootstrapLazy } from "@zeus-js/web-c-runtime";
//#region \0zeus:wc:zw-dialog-description
const components = [{
	tagName: "zw-dialog-description",
	shadow: false,
	formAssociated: false,
	load: () => import("../wc/zw-dialog-description.entry.js"),
	props: []
}];
const component = components[0];
function defineCustomElement(options = {}) {
	bootstrapLazy([component], options);
}
//#endregion
export { components as n, defineCustomElement as r, component as t };
