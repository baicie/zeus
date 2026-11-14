import { createComponent as createComponent$1, createCustomElementMountLifecycle, createSlot, delegateEvents, getElementDefinition, mountElementDefinition } from "@zeus-js/runtime-dom";
import { Host, createEffect, createSignal, defineElement, event, onCleanup, prop } from "@zeus-js/zeus";
import { provideDOMContext } from "@zeus-web/zeus-compat";
import { resolveHostProperties } from "@zeus-js/web-c-runtime";
//#region src/dialog.tsx?zeus-lazy-component=Dialog
const DialogContext = { id: Symbol.for("@zeus-web/dialog/context") };
let dialogId = 0;
const focusableSelector = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	"[tabindex]:not([tabindex=\"-1\"])"
].join(",");
function createDialogId(part) {
	dialogId += 1;
	return `zw-dialog-${part}-${dialogId}`;
}
function getFocusableElements(container) {
	return Array.from(container.querySelectorAll(focusableSelector)).filter((element) => {
		if (element.hasAttribute("disabled")) return false;
		if (element.getAttribute("aria-hidden") === "true") return false;
		if (element.tabIndex < 0) return false;
		if (element.getClientRects().length === 0) return false;
		if (element.closest("[inert]")) return false;
		const visibility = getComputedStyle(element).visibility;
		if (visibility === "hidden" || visibility === "collapse") return false;
		return true;
	});
}
function focusFirstElement(container) {
	var _a;
	((_a = getFocusableElements(container)[0]) !== null && _a !== void 0 ? _a : container).focus();
}
function trapFocus(container, event) {
	if (event.key !== "Tab") return;
	const focusable = getFocusableElements(container);
	if (focusable.length === 0) {
		event.preventDefault();
		container.focus();
		return;
	}
	const first = focusable[0];
	const last = focusable[focusable.length - 1];
	const activeElement = document.activeElement;
	if (event.shiftKey && activeElement === first) {
		event.preventDefault();
		last.focus();
		return;
	}
	if (!event.shiftKey && activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}
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
/**
* Where an element records which mode it is in, so a rebuilt setup inherits it
* instead of re-deriving it from a prop the component itself wrote.
*/
const DIALOG_STATE = Symbol.for("@zeus-web/dialog/state");
const consumedEscapes = escapeRegistry.consumed;
const dialogStack = escapeRegistry.stack;
function pushDialog(token) {
	dialogStack.push(token);
}
function removeDialog(token) {
	const index = dialogStack.lastIndexOf(token);
	if (index >= 0) dialogStack.splice(index, 1);
}
function isTopmostDialog(token) {
	return dialogStack[dialogStack.length - 1] === token;
}
function setupDialog(props, ctx) {
	const contentId = createDialogId("content");
	const titleId = createDialogId("title");
	const descriptionId = createDialogId("description");
	const host = ctx.host;
	const previous = host[DIALOG_STATE];
	const controlled = previous ? previous.controlled : props.open !== void 0;
	const [stateOpen, setStateOpen] = createSignal(previous ? previous.open : controlled ? Boolean(props.open) : Boolean(props.defaultOpen));
	const getOpen = () => controlled ? Boolean(props.open) : stateOpen();
	host[DIALOG_STATE] = {
		controlled,
		get open() {
			return getOpen();
		}
	};
	let triggerElement;
	let contentElement;
	let previouslyFocused;
	let selfWritten;
	const token = Symbol("zw-dialog");
	createEffect(() => {
		if (controlled) return;
		const propOpen = props.open;
		if (propOpen === void 0) return;
		if (Boolean(propOpen) === selfWritten) return;
		setStateOpen(Boolean(propOpen));
	});
	const context = {
		getOpen,
		setOpen: (open, nativeEvent) => {
			const changed = open !== getOpen();
			if (controlled) {
				ctx.emit.openChange({
					open,
					nativeEvent
				});
				return;
			}
			selfWritten = open;
			setStateOpen(open);
			ctx.host.open = open;
			if (changed || nativeEvent) ctx.emit.openChange({
				open,
				nativeEvent
			});
		},
		isModal: () => props.modal !== false,
		getContentId: () => contentId,
		getTitleId: () => titleId,
		getDescriptionId: () => descriptionId,
		registerTrigger: (element) => {
			triggerElement = element;
		},
		registerContent: (element) => {
			contentElement = element;
		},
		focusContent: () => {
			if (contentElement) focusFirstElement(contentElement);
		},
		returnFocus: () => {
			const target = (triggerElement === null || triggerElement === void 0 ? void 0 : triggerElement.isConnected) ? triggerElement : previouslyFocused;
			if (target === null || target === void 0 ? void 0 : target.isConnected) target.focus();
		},
		closeOnOutsideClick: () => props.closeOnOutsideClick !== false
	};
	let previousOpen;
	let focusRequest = 0;
	const scheduleFocusContent = () => {
		const request = ++focusRequest;
		let attempts = 10;
		const attempt = () => {
			setTimeout(() => {
				if (request !== focusRequest || !getOpen()) return;
				if (!contentElement && attempts > 0) {
					attempts -= 1;
					attempt();
					return;
				}
				context.focusContent();
			}, 0);
		};
		attempt();
	};
	const scheduleReturnFocus = () => {
		const request = ++focusRequest;
		setTimeout(() => {
			if (request !== focusRequest || getOpen()) return;
			context.returnFocus();
		}, 0);
	};
	createEffect(() => {
		const isOpen = getOpen();
		const wasOpen = previousOpen;
		previousOpen = isOpen;
		if (wasOpen === void 0) {
			if (isOpen) {
				previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : void 0;
				pushDialog(token);
				scheduleFocusContent();
			}
			return;
		}
		if (isOpen === wasOpen) return;
		if (isOpen) {
			previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : void 0;
			pushDialog(token);
			scheduleFocusContent();
			return;
		}
		removeDialog(token);
		scheduleReturnFocus();
	});
	onCleanup(() => removeDialog(token));
	const handleOutsidePointerDown = (event) => {
		var _a, _b;
		if (!host.isConnected) return;
		if (!getOpen() || props.modal === false || context.closeOnOutsideClick() === false) return;
		const content = contentElement;
		if (!content) return;
		if (((_b = (_a = event.composedPath) === null || _a === void 0 ? void 0 : _a.call(event)) !== null && _b !== void 0 ? _b : []).includes(content)) return;
		context.setOpen(false, event);
	};
	const handleDocumentKeyDown = (event) => {
		if (!host.isConnected || !getOpen() || !isTopmostDialog(token)) return;
		if (event.key === "Escape") {
			if (consumedEscapes.has(event)) return;
			consumedEscapes.add(event);
			event.preventDefault();
			context.setOpen(false, event);
			return;
		}
		if (event.key !== "Tab" || !context.isModal()) return;
		const panel = contentElement;
		if (!panel) return;
		const active = document.activeElement;
		if (!active || !panel.contains(active)) {
			event.preventDefault();
			focusFirstElement(panel);
			return;
		}
		if (active === panel) {
			event.preventDefault();
			focusFirstElement(panel);
			return;
		}
		trapFocus(panel, event);
	};
	const handleDocumentFocusIn = (event) => {
		if (!host.isConnected) return;
		if (!getOpen() || !context.isModal() || !isTopmostDialog(token)) return;
		const panel = contentElement;
		if (!panel) return;
		const target = event.target;
		if (!(target instanceof Node)) return;
		if (panel.contains(target)) return;
		if (target instanceof Element && (target.closest("[data-slot=\"dialog-trigger\"]") || target.closest("[data-slot=\"dialog-close\"]"))) return;
		focusFirstElement(panel);
	};
	let documentListenersAttached = false;
	const attachDocumentListeners = () => {
		if (documentListenersAttached) return;
		document.addEventListener("pointerdown", handleOutsidePointerDown, true);
		document.addEventListener("keydown", handleDocumentKeyDown, true);
		document.addEventListener("focusin", handleDocumentFocusIn, true);
		documentListenersAttached = true;
	};
	const detachDocumentListeners = () => {
		if (!documentListenersAttached) return;
		document.removeEventListener("pointerdown", handleOutsidePointerDown, true);
		document.removeEventListener("keydown", handleDocumentKeyDown, true);
		document.removeEventListener("focusin", handleDocumentFocusIn, true);
		documentListenersAttached = false;
	};
	provideDOMContext(ctx.host, DialogContext, context);
	ctx.expose({
		show() {
			context.setOpen(true);
		},
		close() {
			context.setOpen(false);
		}
	});
	return createComponent$1(Host, {
		get ref() {
			return (element) => {
				if (element) attachDocumentListeners();
				else detachDocumentListeners();
			};
		},
		"data-slot": "dialog-root",
		get "data-state"() {
			return context.getOpen() ? "open" : "closed";
		},
		get "data-modal"() {
			return context.isModal() ? "" : void 0;
		},
		get children() {
			return createSlot(void 0);
		}
	});
}
const Dialog = /* @__PURE__ */ defineElement("zw-dialog", {
	shadow: false,
	props: {
		open: {
			type: Boolean,
			reflect: true,
			default: () => void 0
		},
		defaultOpen: prop(Boolean, { attr: "default-open" }),
		modal: prop(Boolean, {
			default: true,
			reflect: true
		}),
		closeOnOutsideClick: prop(Boolean, {
			attr: "close-on-outside-click",
			default: true
		})
	},
	emits: { openChange: event() },
	meta: { description: "Headless dialog root primitive." }
}, setupDialog);
prop(Boolean);
prop(Boolean, { attr: "force-mount" });
prop(Boolean, { attr: "force-mount" });
prop(Boolean);
delegateEvents(["click"]);
//#endregion
//#region \0zeus:wc:entry:zw-dialog
function createComponent(hostRef) {
	resolveHostProperties(hostRef, getElementDefinition(Dialog).propDefs);
	const mountState = {
		attributeProps: hostRef.attributeProps,
		internals: hostRef.internals,
		reflectingAttrs: hostRef.reflectingAttrs,
		exposedMethods: hostRef.exposedMethods
	};
	const lifecycle = createCustomElementMountLifecycle(() => mountElementDefinition(Dialog, hostRef.host, hostRef.values, mountState));
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
var _zeus_wc_entry_zw_dialog_default = { createComponent };
//#endregion
export { createComponent, _zeus_wc_entry_zw_dialog_default as default };

//# sourceMappingURL=zw-dialog.entry.js.map