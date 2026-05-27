import { template as _$template } from "r-dom";
var _tmpl$ = /*#__PURE__*/_$template(`<div>Hello World`),
  _tmpl$2 = /*#__PURE__*/_$template(`<span>Count: 42`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div><h1>Title</h1><p>Paragraph`),
  _tmpl$4 = /*#__PURE__*/_$template(`<button class=primary>Click me`),
  _tmpl$5 = /*#__PURE__*/_$template(`<input type=text placeholder="Enter text">`),
  _tmpl$6 = /*#__PURE__*/_$template(`<input type=checkbox checked>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<span>First`),
  _tmpl$8 = /*#__PURE__*/_$template(`<span>Second`),
  _tmpl$9 = /*#__PURE__*/_$template(`<svg width=100 height=100><rect x=10 y=10 width=80 height=80 fill=red>`);
// Basic element
export function BasicElement() {
  return _tmpl$();
}

// Element with text binding
export function TextBinding() {
  return _tmpl$2();
}

// Element with multiple children
export function MultipleChildren() {
  return _tmpl$3();
}

// Element with class attribute
export function WithClass() {
  return _tmpl$4();
}

// Element with dynamic attribute
export function DynamicAttribute() {
  return _tmpl$5();
}

// Input self-closing
export function SelfClosing() {
  return _tmpl$6();
}

// Fragment
export function WithFragment() {
  return [_tmpl$7(), _tmpl$8()];
}

// SVG element
export function WithSVG() {
  return _tmpl$9();
}