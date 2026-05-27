import { template as _$template } from "r-dom";
import { Show as _$Show } from "r-dom";
import { setAttribute as _$setAttribute } from "r-dom";
import { effect as _$effect } from "r-dom";
import { insert as _$insert } from "r-dom";
import { createComponent as _$createComponent } from "r-dom";
import { For as _$For } from "r-dom";
var _tmpl$ = /*#__PURE__*/_$template(`<ul>`),
  _tmpl$2 = /*#__PURE__*/_$template(`<li>: `),
  _tmpl$3 = /*#__PURE__*/_$template(`<li>`),
  _tmpl$4 = /*#__PURE__*/_$template(`<div>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<span> `),
  _tmpl$6 = /*#__PURE__*/_$template(`<div>Content is visible`),
  _tmpl$7 = /*#__PURE__*/_$template(`<span>`),
  _tmpl$8 = /*#__PURE__*/_$template(`<span>Guest`);
// For with index
export function ForWithIndex() {
  const items = ['apple', 'banana', 'cherry'];
  return (() => {
    var _el$ = _tmpl$();
    _$insert(_el$, _$createComponent(_$For, {
      each: items,
      children: (item, index) => (() => {
        var _el$2 = _tmpl$2(),
          _el$3 = _el$2.firstChild;
        _$insert(_el$2, index, _el$3);
        _$insert(_el$2, item, null);
        _$effect(() => _$setAttribute(_el$2, "key", index()));
        return _el$2;
      })()
    }));
    return _el$;
  })();
}

// For with object items
export function ForWithObjects() {
  const items = [{
    id: 1,
    name: 'Alice'
  }, {
    id: 2,
    name: 'Bob'
  }, {
    id: 3,
    name: 'Charlie'
  }];
  return (() => {
    var _el$4 = _tmpl$();
    _$insert(_el$4, _$createComponent(_$For, {
      each: items,
      children: item => (() => {
        var _el$5 = _tmpl$3();
        _$insert(_el$5, () => item.name);
        _$effect(() => _$setAttribute(_el$5, "key", item.id));
        return _el$5;
      })()
    }));
    return _el$4;
  })();
}

// For nested
export function NestedFor() {
  const matrix = [[1, 2, 3], [4, 5, 6]];
  return (() => {
    var _el$6 = _tmpl$4();
    _$insert(_el$6, _$createComponent(_$For, {
      each: matrix,
      children: row => (() => {
        var _el$7 = _tmpl$4();
        _$insert(_el$7, _$createComponent(_$For, {
          each: row,
          children: cell => (() => {
            var _el$8 = _tmpl$5(),
              _el$9 = _el$8.firstChild;
            _$insert(_el$8, cell, _el$9);
            return _el$8;
          })()
        }));
        return _el$7;
      })()
    }));
    return _el$6;
  })();
}

// For with empty array
export function EmptyFor() {
  const items: string[] = [];
  return (() => {
    var _el$0 = _tmpl$();
    _$insert(_el$0, _$createComponent(_$For, {
      each: items,
      children: item => (() => {
        var _el$1 = _tmpl$3();
        _$insert(_el$1, item);
        return _el$1;
      })()
    }));
    return _el$0;
  })();
}

// Show simple
export function ShowSimple() {
  const visible = true;
  return _$createComponent(_$Show, {
    when: visible,
    get children() {
      return _tmpl$6();
    }
  });
}

// Show with null/undefined
export function ShowUndefined() {
  let value: string | undefined = undefined;
  return _$createComponent(_$Show, {
    when: value,
    get children() {
      var _el$11 = _tmpl$7();
      _$insert(_el$11, value);
      return _el$11;
    }
  });
}

// Show with fallback
export function ShowWithFallback() {
  const user = null;
  return _$createComponent(_$Show, {
    when: user,
    get fallback() {
      return _tmpl$8();
    },
    children: u => (() => {
      var _el$13 = _tmpl$7();
      _$insert(_el$13, () => u.name);
      return _el$13;
    })()
  });
}