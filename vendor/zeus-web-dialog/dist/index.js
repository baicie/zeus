import { bindAttr, bindEvent, bindRef, createComponent, createSlot, delegateEvents, insert, template } from "@zeus-js/runtime-dom";
import { Host, createEffect, createSignal, defineElement, event, onCleanup, prop } from "@zeus-js/zeus";
import { provideDOMContext, resolveDOMContext } from "@zeus-web/zeus-compat";
//#region src/dialog.tsx
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
	return createComponent(Host, {
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
const Dialog = defineElement("zw-dialog", {
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
function setupDialogTrigger(props, ctx) {
	const result = resolveDOMContext(ctx.host, DialogContext);
	const dialog = result.found ? result.value : void 0;
	let control;
	ctx.expose({ focus() {
		control.focus();
	} });
	return createComponent(Host, {
		"data-slot": "dialog-trigger",
		get "data-disabled"() {
			return props.disabled ? "" : void 0;
		},
		get children() {
			return (() => {
				const $zeusInlineTemplate = template("<button part=\"trigger\" type=\"button\" aria-haspopup=\"dialog\" data-zeus-node=\"13\"><!></button>");
				return (() => {
					const $zeusInlineElement = $zeusInlineTemplate().firstChild;
					$zeusInlineElement.removeAttribute("data-zeus-node");
					const $zeusMarker = $zeusInlineElement.ownerDocument.createTreeWalker($zeusInlineElement, 128).nextNode();
					bindRef($zeusInlineElement, (element) => {
						if (element) {
							control = element;
							dialog === null || dialog === void 0 || dialog.registerTrigger(element);
						}
					});
					bindAttr($zeusInlineElement, "disabled", () => Boolean(props.disabled));
					bindAttr($zeusInlineElement, "aria-controls", () => dialog === null || dialog === void 0 ? void 0 : dialog.getContentId());
					bindAttr($zeusInlineElement, "aria-expanded", () => String(Boolean(dialog === null || dialog === void 0 ? void 0 : dialog.getOpen())));
					bindEvent($zeusInlineElement, "click", (nativeEvent) => {
						if (!props.disabled) dialog === null || dialog === void 0 || dialog.setOpen(true, nativeEvent);
					});
					const $zeusChild = createSlot(void 0);
					insert($zeusMarker.parentNode, $zeusChild, $zeusMarker);
					$zeusMarker.remove();
					return $zeusInlineElement;
				})();
			})();
		}
	});
}
const DialogTrigger = defineElement("zw-dialog-trigger", {
	shadow: false,
	props: { disabled: prop(Boolean) },
	meta: { description: "Headless dialog trigger primitive." }
}, setupDialogTrigger);
function setupDialogContent(props, ctx) {
	const result = resolveDOMContext(ctx.host, DialogContext);
	const dialog = result.found ? result.value : void 0;
	let panel;
	const isOpen = () => Boolean(dialog === null || dialog === void 0 ? void 0 : dialog.getOpen());
	ctx.expose({ focus() {
		panel.focus();
	} });
	return createComponent(Host, {
		"data-slot": "dialog-content",
		get "data-state"() {
			return isOpen() ? "open" : "closed";
		},
		get hidden() {
			return props.forceMount ? false : !isOpen();
		},
		get children() {
			return (() => {
				const $zeusInlineTemplate0 = template("<div part=\"content\" role=\"dialog\" data-zeus-node=\"29\"><!></div>");
				return (() => {
					const $zeusInlineElement0 = $zeusInlineTemplate0().firstChild;
					$zeusInlineElement0.removeAttribute("data-zeus-node");
					const $zeusMarker0 = $zeusInlineElement0.ownerDocument.createTreeWalker($zeusInlineElement0, 128).nextNode();
					bindRef($zeusInlineElement0, (element) => {
						if (!element) return;
						panel = element;
						dialog === null || dialog === void 0 || dialog.registerContent(element);
					});
					bindAttr($zeusInlineElement0, "id", () => dialog === null || dialog === void 0 ? void 0 : dialog.getContentId());
					bindAttr($zeusInlineElement0, "aria-modal", () => (dialog === null || dialog === void 0 ? void 0 : dialog.isModal()) ? "true" : void 0);
					bindAttr($zeusInlineElement0, "aria-labelledby", () => dialog === null || dialog === void 0 ? void 0 : dialog.getTitleId());
					bindAttr($zeusInlineElement0, "aria-describedby", () => dialog === null || dialog === void 0 ? void 0 : dialog.getDescriptionId());
					bindAttr($zeusInlineElement0, "tabindex", () => -1);
					const $zeusChild0 = createSlot(void 0);
					insert($zeusMarker0.parentNode, $zeusChild0, $zeusMarker0);
					$zeusMarker0.remove();
					return $zeusInlineElement0;
				})();
			})();
		}
	});
}
const DialogContent = defineElement("zw-dialog-content", {
	shadow: false,
	props: { forceMount: prop(Boolean, { attr: "force-mount" }) },
	meta: { description: "Headless dialog content primitive." }
}, setupDialogContent);
function setupDialogOverlay(props, ctx) {
	const result = resolveDOMContext(ctx.host, DialogContext);
	const dialog = result.found ? result.value : void 0;
	const isOpen = () => Boolean(dialog === null || dialog === void 0 ? void 0 : dialog.getOpen());
	return createComponent(Host, {
		part: "overlay",
		"data-slot": "dialog-overlay",
		get "data-state"() {
			return isOpen() ? "open" : "closed";
		},
		get hidden() {
			return props.forceMount ? false : !isOpen();
		},
		get children() {
			return createSlot(void 0);
		}
	});
}
defineElement("zw-dialog-overlay", {
	shadow: false,
	props: { forceMount: prop(Boolean, { attr: "force-mount" }) },
	meta: { description: "Dialog backdrop primitive." }
}, setupDialogOverlay);
function setupDialogClose(props, ctx) {
	const result = resolveDOMContext(ctx.host, DialogContext);
	const dialog = result.found ? result.value : void 0;
	let control;
	ctx.expose({ focus() {
		control.focus();
	} });
	return createComponent(Host, {
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
const DialogClose = defineElement("zw-dialog-close", {
	shadow: false,
	props: { disabled: prop(Boolean) },
	meta: { description: "Headless dialog close primitive." }
}, setupDialogClose);
const DialogTitle = defineElement("zw-dialog-title", {
	shadow: false,
	meta: { description: "Headless dialog title primitive." }
}, (_props, ctx) => {
	const result = resolveDOMContext(ctx.host, DialogContext);
	const dialog = result.found ? result.value : void 0;
	return createComponent(Host, {
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
const DialogDescription = defineElement("zw-dialog-description", {
	shadow: false,
	meta: { description: "Headless dialog description primitive." }
}, (_props, ctx) => {
	const result = resolveDOMContext(ctx.host, DialogContext);
	const dialog = result.found ? result.value : void 0;
	return createComponent(Host, {
		get id() {
			return dialog === null || dialog === void 0 ? void 0 : dialog.getDescriptionId();
		},
		part: "description",
		"data-slot": "dialog-description",
		get children() {
			return createSlot(void 0);
		}
	});
});
delegateEvents(["click"]);
//#endregion
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle, DialogTrigger };

//# sourceMappingURL=index.js.map