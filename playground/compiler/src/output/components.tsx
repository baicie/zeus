import { insert as _insert, createComponent as _createComponent, template as _template } from "@zeus-js/runtime-dom";
var _tmpl$ = /*#__PURE__*/_template(`<span>Count:</span>`),
  _tmpl$2 = /*#__PURE__*/_template(`<div><h1></h1></div>`),
  _tmpl$3 = /*#__PURE__*/_template(`<div></div>`);
// Custom component usage
import { Show } from '@zeus-js/runtime-dom';
interface Props {
  title: string;
  count?: number;
}
export function MyComponent(props: Props) {
  return (() => {
    const _el$2 = _el$.firstChild;
    _insert(_el$2, props.title);
    _insert(_el$, _createComponent(Show, {
      when: props.count !== undefined,
      children: (() => {
        _insert(_el$3, props.count);
        return _tmpl$();
      })()
    }));
    return _tmpl$2();
  })();
}

// Nested components
export function ParentComponent() {
  return (() => {
    _insert(_el$4, _createComponent(MyComponent, {
      title: "Hello"
    }));
    _insert(_el$4, _createComponent(MyComponent, {
      title: "World",
      count: 5
    }));
    return _tmpl$3();
  })();
}