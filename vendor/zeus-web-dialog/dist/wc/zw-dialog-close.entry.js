import { bindAttr, bindEvent, bindRef, createComponent as createComponent$1, createCustomElementMountLifecycle, createSlot, delegateEvents, getElementDefinition, insert, mountElementDefinition, template } from "@zeus-js/runtime-dom";
import { Host, defineElement, event, prop } from "@zeus-js/zeus";
import { resolveDOMContext } from "@zeus-web/zeus-compat";
import { resolveHostProperties } from "@zeus-js/web-c-runtime";
//#region src/dialog.tsx?zeus-lazy-component=DialogClose
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
function setupDialogClose(props, ctx) {
	const result = resolveDOMContext(ctx.host, DialogContext);
	const dialog = result.found ? result.value : void 0;
	let control;
	ctx.expose({ focus() {
		control.focus();
	} });
	return createComponent$1(Host, {
		"data-slot": "dialog-close",
		get "data-disabled"() {
			return props.disabled ? "" : void 0;
		},
		get children() {
			return (() => {
				const $zeusInlineTemplate1 = template("<button part=\"close\" type=\"button\" data-zeus-node=\"52\"><!></button>");
				return (() => {
					const $zeusInlineElement1 = $zeusInlineTemplate1().firstChild;
					$zeusInlineElement1.removeAttribute("data-zeus-node");
					const $zeusMarker1 = $zeusInlineElement1.ownerDocument.createTreeWalker($zeusInlineElement1, 128).nextNode();
					bindRef($zeusInlineElement1, (element) => {
						if (element) control = element;
					});
					bindAttr($zeusInlineElement1, "disabled", () => Boolean(props.disabled));
					bindEvent($zeusInlineElement1, "click", (nativeEvent) => {
						if (!props.disabled) dialog === null || dialog === void 0 || dialog.setOpen(false, nativeEvent);
					});
					const $zeusChild1 = createSlot(void 0);
					insert($zeusMarker1.parentNode, $zeusChild1, $zeusMarker1);
					$zeusMarker1.remove();
					return $zeusInlineElement1;
				})();
			})();
		}
	});
}
const DialogClose = /* @__PURE__ */ defineElement("zw-dialog-close", {
	shadow: false,
	props: { disabled: prop(Boolean) },
	meta: { description: "Headless dialog close primitive." }
}, setupDialogClose);
delegateEvents(["click"]);
//#endregion
//#region \0zeus:wc:entry:zw-dialog-close
function createComponent(hostRef) {
	resolveHostProperties(hostRef, getElementDefinition(DialogClose).propDefs);
	const mountState = {
		attributeProps: hostRef.attributeProps,
		internals: hostRef.internals,
		reflectingAttrs: hostRef.reflectingAttrs,
		exposedMethods: hostRef.exposedMethods
	};
	const lifecycle = createCustomElementMountLifecycle(() => mountElementDefinition(DialogClose, hostRef.host, hostRef.values, mountState));
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
var _zeus_wc_entry_zw_dialog_close_default = { createComponent };
//#endregion
export { createComponent, _zeus_wc_entry_zw_dialog_close_default as default };

//# sourceMappingURL=zw-dialog-close.entry.js.map