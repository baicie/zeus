import { r as defineCustomElement } from "../chunks/_zeus_wc_zw-dialog-pgS6hUDe.js";
import { defineContainer } from "@zeus-js/output-vue-wrapper/runtime";
//#region \0zeus:vue:zw-dialog
const Dialog = defineContainer({
	tagName: "zw-dialog",
	displayName: "Dialog",
	defineCustomElement,
	props: {
		"closeOnOutsideClick": "close-on-outside-click",
		"defaultOpen": "default-open",
		"modal": "modal",
		"open": "open"
	},
	booleanProps: [
		"closeOnOutsideClick",
		"defaultOpen",
		"modal",
		"open"
	],
	events: ["open-change"],
	slots: [],
	model: {
		prop: "open",
		event: "open-change",
		eventPath: "detail.open"
	}
});
//#endregion
export { Dialog };
