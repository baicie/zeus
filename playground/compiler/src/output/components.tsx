import { marker as _marker, insert as _insert, bindText as _bindText, mountShow as _mountShow, createComponent as _createComponent, template as _template } from "@zeus-js/runtime-dom";
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
    const _marker$ = _marker(_el$2, 0);
    const _text$ = document.createTextNode("");
    _insert(_el$2, _text$, _marker$);
    _bindText(_text$, () => props.title);
    const _show$ = _marker(_el$, 0);
    _mountShow(_el$, _show$, () => props.count !== undefined, () => (() => {
      const _el$3 = _tmpl$2().firstChild;
      const _marker$2 = _marker(_el$3, 0);
      const _text$2 = document.createTextNode("");
      _insert(_el$3, _text$2, _marker$2);
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
    const _marker$3 = _marker(_el$4, 0);
    _insert(_el$4, _createComponent(MyComponent, {
      title: "Hello"
    }), _marker$3);
    const _marker$4 = _marker(_el$4, 1);
    _insert(_el$4, _createComponent(MyComponent, {
      title: "World",
      count: 5
    }), _marker$4);
    return _el$4;
  })();
}