import { createComponent as createComponent$1, createCustomElementMountLifecycle, createSlot, delegateEvents, getElementDefinition, mountElementDefinition } from "@zeus-js/runtime-dom";
import { Host, defineElement, event, prop } from "@zeus-js/zeus";
import { resolveDOMContext } from "@zeus-web/zeus-compat";
import { resolveHostProperties } from "@zeus-js/web-c-runtime";
//#region src/dialog.tsx?zeus-lazy-component=DialogTitle
const DialogContext = { id: Symbol.for("@zeus-web/dialog/context") };
[
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex=\"-1\"])"
].join(",");
/**
* Shared across every copy of this module that runs on the page.
*
* The dialog parts are emitted as separate lazy entries, and each entry is its
* own bundle with its own module scope — a module-level `WeakSet` is therefore
* one set *per component*, and a nested dialog's copy cannot see the press its
* parent already handled. A registry keyed on the global object is the one
* place all of them agree on.
*
* `Symbol.for` rather than a property name: the point is that two bundles
* written from the same source agree without either of them owning the
* definition.
*/
const ESCAPE_REGISTRY_KEY = Symbol.for("@zeus-web/dialog/consumed-escapes");
const escapeRegistry = (() => {
	var _a;
	const scope = globalThis;
	(_a = scope[ESCAPE_REGISTRY_KEY]) !== null && _a !== void 0 || (scope[ESCAPE_REGISTRY_KEY] = {
		consumed: /* @__PURE__ */ new WeakSet(),
		stack: []
	});
	return scope[ESCAPE_REGISTRY_KEY];
})();
escapeRegistry.consumed;
escapeRegistry.stack;
prop(Boolean, { attr: "default-open" }), prop(Boolean, {
	default: true,
	reflect: true
}), prop(Boolean, {
	attr: "close-on-outside-click",
	default: true
}), event();
prop(Boolean);
prop(Boolean, { attr: "force-mount" });
prop(Boolean, { attr: "force-mount" });
prop(Boolean);
const DialogTitle = /* @__PURE__ */ defineElement("zw-dialog-title", {
	shadow: false,
	meta: { description: "Headless dialog title primitive." }
}, (_props, ctx) => {
	const result = resolveDOMContext(ctx.host, DialogContext);
	const dialog = result.found ? result.value : void 0;
	return createComponent$1(Host, {
		get id() {
			return dialog === null || dialog === void 0 ? void 0 : dialog.getTitleId();
		},
		part: "title",
		"data-slot": "dialog-title",
		get children() {
			return createSlot(void 0);
		}
	});
});
delegateEvents(["click"]);
//#endregion
//#region \0zeus:wc:entry:zw-dialog-title
function createComponent(hostRef) {
	resolveHostProperties(hostRef, getElementDefinition(DialogTitle).propDefs);
	const mountState = {
		attributeProps: hostRef.attributeProps,
		internals: hostRef.internals,
		reflectingAttrs: hostRef.reflectingAttrs,
		exposedMethods: hostRef.exposedMethods
	};
	const lifecycle = createCustomElementMountLifecycle(() => mountElementDefinition(DialogTitle, hostRef.host, hostRef.values, mountState));
	return {
		connected() {
			lifecycle.connect();
		},
		disconnected() {
			lifecycle.disconnect();
		},
		propertyChanged(change) {
			var _lifecycle$current;
			(_lifecycle$current = lifecycle.current()) === null || _lifecycle$current === void 0 || _lifecycle$current.propertyChanged(change);
		},
		formAssociated(form) {
			var _lifecycle$current2;
			(_lifecycle$current2 = lifecycle.current()) === null || _lifecycle$current2 === void 0 || _lifecycle$current2.formAssociated(form);
		},
		formDisabled(disabled) {
			var _lifecycle$current3;
			(_lifecycle$current3 = lifecycle.current()) === null || _lifecycle$current3 === void 0 || _lifecycle$current3.formDisabled(disabled);
		},
		formReset() {
			var _lifecycle$current4;
			(_lifecycle$current4 = lifecycle.current()) === null || _lifecycle$current4 === void 0 || _lifecycle$current4.formReset();
		},
		formStateRestore(state, mode) {
			var _lifecycle$current5;
			(_lifecycle$current5 = lifecycle.current()) === null || _lifecycle$current5 === void 0 || _lifecycle$current5.formStateRestore(state, mode);
		}
	};
}
var _zeus_wc_entry_zw_dialog_title_default = { createComponent };
//#endregion
export { createComponent, _zeus_wc_entry_zw_dialog_title_default as default };

//# sourceMappingURL=zw-dialog-title.entry.js.map