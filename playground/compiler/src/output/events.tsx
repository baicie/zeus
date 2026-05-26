import { bindEvent as _bindEvent, template as _template, delegateEvents as _delegateEvents } from "@zeus-js/runtime-dom";
var _tmpl$ = /*#__PURE__*/_template(`<button>Click me</button>`),
  _tmpl$2 = /*#__PURE__*/_template(`<div>Hover me</div>`),
  _tmpl$3 = /*#__PURE__*/_template(`<button>Click</button>`),
  _tmpl$4 = /*#__PURE__*/_template(`<input>`);
// Event handlers
export function ClickHandler() {
  return (() => {
    const _el$ = _tmpl$().firstChild;
    _bindEvent(_el$, "click", () => console.log('clicked'));
    return _el$;
  })();
}

// Multiple event handlers
export function MultipleEvents() {
  return (() => {
    const _el$2 = _tmpl$2().firstChild;
    _bindEvent(_el$2, "mouseenter", () => console.log('enter'));
    _bindEvent(_el$2, "mouseleave", () => console.log('leave'));
    return _el$2;
  })();
}

// Event with args
export function EventWithArgs() {
  const handleClick = (e: Event, id: number) => {
    console.log(id);
  };
  return (() => {
    const _el$3 = _tmpl$3().firstChild;
    _bindEvent(_el$3, "click", e => handleClick(e, 123));
    return _el$3;
  })();
}

// Input with onChange
export function InputWithChange() {
  return (() => {
    const _el$4 = _tmpl$4().firstChild;
    _bindEvent(_el$4, "change", e => console.log(e.target.value));
    return _el$4;
  })();
}
_delegateEvents(["click", "mouseenter", "mouseleave", "change"]);