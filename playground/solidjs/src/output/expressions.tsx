import { template as _$template } from "r-dom";
import { setAttribute as _$setAttribute } from "r-dom";
import { insert as _$insert } from "r-dom";
var _tmpl$ = /*#__PURE__*/_$template(`<div>World`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div>yes`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div>visible`),
  _tmpl$4 = /*#__PURE__*/_$template(`<span>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<ul>`),
  _tmpl$7 = /*#__PURE__*/_$template(`<li>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<span>0`),
  _tmpl$9 = /*#__PURE__*/_$template(`<div>30`),
  _tmpl$0 = /*#__PURE__*/_$template(`<div>-5`),
  _tmpl$1 = /*#__PURE__*/_$template(`<div>12`);
// Dynamic expressions in JSX
export function DynamicExpr() {
  const name = 'World';
  return _tmpl$();
}

// Ternary expression
export function TernaryExpr() {
  const flag = true;
  return _tmpl$2();
}

// Logical AND expression
export function LogicalExpr() {
  const show = true;
  return _tmpl$3();
}

// Function call
export function FunctionCall() {
  const format = (n: number) => `Count: ${n}`;
  return (() => {
    var _el$4 = _tmpl$4();
    _$insert(_el$4, () => format(100));
    return _el$4;
  })();
}

// Object property access
export function ObjectProp() {
  const user = {
    name: 'Alice',
    age: 30
  };
  return (() => {
    var _el$5 = _tmpl$5();
    _$insert(_el$5, () => user.name);
    return _el$5;
  })();
}

// Array map
export function ArrayMap() {
  const items = ['a', 'b', 'c'];
  return (() => {
    var _el$6 = _tmpl$6();
    _$insert(_el$6, () => items.map(item => (() => {
      var _el$7 = _tmpl$7();
      _$setAttribute(_el$7, "key", item);
      _$insert(_el$7, item);
      return _el$7;
    })()));
    return _el$6;
  })();
}

// Static expression (should NOT be wrapped)
export function StaticOnce() {
  const count = 0;
  return _tmpl$8();
}

// Computed expression
export function ComputedExpr() {
  const a = 10;
  const b = 20;
  return _tmpl$9();
}

// Unary expression
export function UnaryExpr() {
  const value = 5;
  return _tmpl$0();
}

// Binary expression
export function BinaryExpr() {
  const x = 3;
  const y = 4;
  return _tmpl$1();
}