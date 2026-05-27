import { insert as _insert, bindText as _bindText, template as _template } from "@zeus-js/runtime-dom";
var _tmpl$ = /*#__PURE__*/_template(`<div>Hello World</div>`),
  _tmpl$2 = /*#__PURE__*/_template(`<span>Count:<!></span>`),
  _tmpl$3 = /*#__PURE__*/_template(`<div><h1>Title</h1><p>Paragraph</p></div>`),
  _tmpl$4 = /*#__PURE__*/_template(`<button class="primary">Click me</button>`),
  _tmpl$5 = /*#__PURE__*/_template(`<input type="text" placeholder="Enter text">`),
  _tmpl$6 = /*#__PURE__*/_template(`<span>First</span>`),
  _tmpl$7 = /*#__PURE__*/_template(`<span>Second</span>`);
// Basic element
export function BasicElement() {
  return _tmpl$().firstChild;
}

// Element with text binding
export function TextBinding() {
  return (() => {
    const _el$2 = _tmpl$2().firstChild;
    const _anchor$ = _el$2.childNodes[1];
    const _text$ = document.createTextNode("");
    _insert(_el$2, _text$, _anchor$);
    _bindText(_text$, () => 42);
    return _el$2;
  })();
}

// Element with multiple children
export function MultipleChildren() {
  return _tmpl$3().firstChild;
}

// Element with attribute
export function WithAttribute() {
  return _tmpl$4().firstChild;
}

// Element with dynamic attribute
export function DynamicAttribute() {
  return _tmpl$5().firstChild;
}

// Fragment
export function WithFragment() {
  return [_tmpl$6().firstChild, _tmpl$7().firstChild];
}