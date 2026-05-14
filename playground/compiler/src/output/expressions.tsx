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
    const _el$ = _tmpl$().firstChild;
    _insert(_el$, name);
    return _el$;
  })();
}

// Ternary expression
export function TernaryExpr() {
  const flag = true;
  return (() => {
    const _el$2 = _tmpl$().firstChild;
    _insert(_el$2, flag ? 'yes' : 'no');
    return _el$2;
  })();
}

// Logical AND expression
export function LogicalExpr() {
  const show = true;
  return (() => {
    const _el$3 = _tmpl$().firstChild;
    _insert(_el$3, show && 'visible');
    return _el$3;
  })();
}

// Function call
export function FunctionCall() {
  const format = (n: number) => `Count: ${n}`;
  return (() => {
    const _el$4 = _tmpl$2().firstChild;
    _insert(_el$4, format(100));
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
    const _el$5 = _tmpl$().firstChild;
    _insert(_el$5, user.name);
    return _el$5;
  })();
}

// Array map
export function ArrayMap() {
  const items = ['a', 'b', 'c'];
  return (() => {
    const _el$6 = _tmpl$3().firstChild;
    _insert(_el$6, items.map(item => (() => {
      const _el$7 = _tmpl$4().firstChild;
      _setAttr(_el$7, "key", item);
      _insert(_el$7, item);
      return _el$7;
    })()));
    return _el$6;
  })();
}