import { r as defineCustomElement } from "../chunks/_zeus_wc_zw-dialog-pgS6hUDe.js";
import React from "react";
import { createComponent } from "@zeus-js/output-react-wrapper/runtime";
//#region \0zeus:react:zw-dialog
const Dialog = createComponent({
	react: React,
	tagName: "zw-dialog",
	defineCustomElement,
	props: {
		"closeOnOutsideClick": "close-on-outside-click",
		"defaultOpen": "default-open",
		"modal": "modal",
		"open": "open"
	},
	events: { "onOpenChange": "open-change" },
	slots: [],
	displayName: "Dialog"
});
//#endregion
export { Dialog };
