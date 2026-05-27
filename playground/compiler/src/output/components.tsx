import { insert as _insert, bindText as _bindText, mountShow as _mountShow, createComponent as _createComponent, template as _template } from "@zeus-js/runtime-dom";
var _tmpl$ = /*#__PURE__*/_template(`<div class="component"><h1><!></h1><!></div>`),
  _tmpl$2 = /*#__PURE__*/_template(`<span>Count:<!></span>`),
  _tmpl$3 = /*#__PURE__*/_template(`<div><!><!></div>`);
// Custom component usage
import { Show } from '@zeus-js/runtime-dom';
interface Props {
  title: string;
  count?: number;
}
export function MyComponent(props: Props) {
  return (() => {
    const _el$ = _tmpl$().firstChild;
    const _el$2 = _el$.firstChild;
    const _anchor$ = _el$2.firstChild;
    const _show$ = _el$2.nextSibling;
    const _text$ = document.createTextNode("");
    _insert(_el$2, _text$, _anchor$);
    _bindText(_text$, () => props.title);
    _mountShow(_el$, _show$, () => props.count !== undefined, () => (() => {
      const _el$3 = _tmpl$2().firstChild;
      const _anchor$2 = _el$3.childNodes[1];
      const _text$2 = document.createTextNode("");
      _insert(_el$3, _text$2, _anchor$2);
      _bindText(_text$2, () => props.count);
      return _el$3;
    })(), undefined);
    return _el$;
  })();
}

// Nested components
export function ParentComponent() {
  return (() => {
    const _el$4 = _tmpl$3().firstChild;
    const _cmp$ = _el$4.firstChild;
    const _cmp$2 = _cmp$.nextSibling;
    _insert(_el$4, _createComponent(MyComponent, {
      title: "Hello"
    }), _cmp$);
    _insert(_el$4, _createComponent(MyComponent, {
      title: "World",
      count: 5
    }), _cmp$2);
    return _el$4;
  })();
}