import { template as _$template } from "r-dom";
import { createComponent as _$createComponent } from "r-dom";
import { insert as _$insert } from "r-dom";
var _tmpl$ = /*#__PURE__*/_$template(`<span>Count: `),
  _tmpl$2 = /*#__PURE__*/_$template(`<div class=component><h1>`),
  _tmpl$3 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<ul>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<li>`),
  _tmpl$6 = /*#__PURE__*/_$template(`<span>Welcome!`),
  _tmpl$7 = /*#__PURE__*/_$template(`<span>Please log in`),
  _tmpl$8 = /*#__PURE__*/_$template(`<div>Dynamic tag: div`);
// Custom component usage with For and Show built-ins
import { For, Show } from 'solid-js';
interface Props {
  title: string;
  count?: number;
}
export function MyComponent(props: Props) {
  return (() => {
    var _el$ = _tmpl$2(),
      _el$2 = _el$.firstChild;
    _$insert(_el$2, () => props.title);
    _$insert(_el$, _$createComponent(Show, {
      get when() {
        return props.count !== undefined;
      },
      get children() {
        var _el$3 = _tmpl$(),
          _el$4 = _el$3.firstChild;
        _$insert(_el$3, () => props.count, null);
        return _el$3;
      }
    }), null);
    return _el$;
  })();
}

// Nested components
export function ParentComponent() {
  return (() => {
    var _el$5 = _tmpl$3();
    _$insert(_el$5, _$createComponent(MyComponent, {
      title: "Hello"
    }), null);
    _$insert(_el$5, _$createComponent(MyComponent, {
      title: "World",
      count: 5
    }), null);
    return _el$5;
  })();
}

// Component with For list
export function ListComponent() {
  const items = ['a', 'b', 'c'];
  return (() => {
    var _el$6 = _tmpl$4();
    _$insert(_el$6, _$createComponent(For, {
      each: items,
      children: item => (() => {
        var _el$7 = _tmpl$5();
        _$insert(_el$7, item);
        return _el$7;
      })()
    }));
    return _el$6;
  })();
}

// Component with Show else branch
export function ConditionalComponent() {
  const loggedIn = false;
  return (() => {
    var _el$8 = _tmpl$3();
    _$insert(_el$8, _$createComponent(Show, {
      when: loggedIn,
      get fallback() {
        return _tmpl$7();
      },
      get children() {
        return _tmpl$6();
      }
    }));
    return _el$8;
  })();
}

// Dynamic component (mixed-case tag)
export function DynamicTag() {
  const tag = 'div';
  return _tmpl$8();
}