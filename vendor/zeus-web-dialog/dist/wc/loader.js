import { t as components } from "../chunks/_zeus_wc_components-CBl5E_aY.js";
import { bootstrapLazy } from "@zeus-js/web-c-runtime";
//#region \0zeus:wc:loader
const componentsByTagName = new Map(components.map((component) => [component.tagName, component]));
function resolveRegistry(options) {
	var _options$registry;
	return (_options$registry = options.registry) !== null && _options$registry !== void 0 ? _options$registry : typeof customElements === "undefined" ? void 0 : customElements;
}
function defineCustomElement(tagName, options = {}) {
	const registry = resolveRegistry(options);
	if (!registry) return;
	const component = componentsByTagName.get(tagName);
	if (!component) throw new Error(`[zeus:web-c] Unknown custom element: <${tagName}>.`);
	bootstrapLazy([component], { registry });
}
function defineCustomElements(options = {}) {
	for (const component of components) defineCustomElement(component.tagName, options);
}
//#endregion
export { defineCustomElement, defineCustomElements };
