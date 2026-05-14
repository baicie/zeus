import { insert as _insert, setAttr as _setAttr, template as _template } from "@zeus-js/runtime-dom";
var _tmpl$ = /*#__PURE__*/_template(`<div></div>`),
  _tmpl$2 = /*#__PURE__*/_template(`<span></span>`),
  _tmpl$3 = /*#__PURE__*/_template(`<ul></ul>`),
  _tmpl$4 = /*#__PURE__*/_template(`<li></li>`);
// Dynamic expressions in JSX
export function DynamicExpr() {
  const name = 'World';
  const count = 42;
  return (() => {
    _insert(_el$, name);
    return _tmpl$();
  })();
}

// Ternary expression
export function TernaryExpr() {
  const flag = true;
  return (() => {
    _insert(_el$2, flag ? 'yes' : 'no');
    return _tmpl$();
  })();
}

// Logical AND expression
export function LogicalExpr() {
  const show = true;
  return (() => {
    _insert(_el$3, show && 'visible');
    return _tmpl$();
  })();
}

// Function call
export function FunctionCall() {
  const format = (n: number) => `Count: ${n}`;
  return (() => {
    _insert(_el$4, format(100));
    return _tmpl$2();
  })();
}

// Object property access
export function ObjectProp() {
  const user = {
    name: 'Alice',
    age: 30
  };
  return (() => {
    _insert(_el$5, user.name);
    return _tmpl$();
  })();
}

// Array map
export function ArrayMap() {
  const items = ['a', 'b', 'c'];
  return (() => {
    _insert(_el$6, items.map(item => (() => {
      _setAttr(_el$7, "key", item);
      _insert(_el$7, item);
      return _tmpl$4();
    })()));
    return _tmpl$3();
  })();
}