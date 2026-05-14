import { insert as _insert, template as _template } from "@zeus-js/runtime-dom";
var _tmpl$ = /*#__PURE__*/_template(`<div>Hello World</div>`),
  _tmpl$2 = /*#__PURE__*/_template(`<span>Count:</span>`),
  _tmpl$3 = /*#__PURE__*/_template(`<div><h1>Title</h1><p>Paragraph</p></div>`),
  _tmpl$4 = /*#__PURE__*/_template(`<button>Click me</button>`),
  _tmpl$5 = /*#__PURE__*/_template(`<input>`),
  _tmpl$6 = /*#__PURE__*/_template(`<span>First</span>`),
  _tmpl$7 = /*#__PURE__*/_template(`<span>Second</span>`);
// Basic element
export function BasicElement() {
  return (() => {
    return _tmpl$();
  })();
}

// Element with text binding
export function TextBinding() {
  return (() => {
    _insert(_el$2, 42);
    return _tmpl$2();
  })();
}

// Element with multiple children
export function MultipleChildren() {
  return (() => {
    const _el$4 = _el$3.firstChild;
    const _el$5 = _el$4.nextSibling;
    return _tmpl$3();
  })();
}

// Element with attribute
export function WithAttribute() {
  return (() => {
    return _tmpl$4();
  })();
}

// Element with dynamic attribute
export function DynamicAttribute() {
  return (() => {
    return _tmpl$5();
  })();
}

// Fragment
export function WithFragment() {
  return [(() => {
    return _tmpl$6();
  })(), (() => {
    return _tmpl$7();
  })()];
}