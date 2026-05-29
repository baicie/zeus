import {
  insert as _insert,
  bindText as _bindText,
  bindAttr as _bindAttr,
  template as _template,
} from '@zeus-js/runtime-dom'
var _tmpl$ = /*#__PURE__*/ _template(`<div><!></div>`),
  _tmpl$2 = /*#__PURE__*/ _template(`<span><!></span>`),
  _tmpl$3 = /*#__PURE__*/ _template(`<ul><!></ul>`),
  _tmpl$4 = /*#__PURE__*/ _template(`<li><!></li>`)
// Dynamic expressions in JSX
export function DynamicExpr() {
  const name = 'World'
  const count = 42
  return (() => {
    const _el$ = _tmpl$().firstChild
    const _anchor$ = _el$.firstChild
    const _text$ = document.createTextNode('')
    _insert(_el$, _text$, _anchor$)
    _bindText(_text$, () => name)
    return _el$
  })()
}

// Ternary expression
export function TernaryExpr() {
  const flag = true
  return (() => {
    const _el$2 = _tmpl$().firstChild
    const _anchor$2 = _el$2.firstChild
    const _text$2 = document.createTextNode('')
    _insert(_el$2, _text$2, _anchor$2)
    _bindText(_text$2, () => (flag ? 'yes' : 'no'))
    return _el$2
  })()
}

// Logical AND expression
export function LogicalExpr() {
  const show = true
  return (() => {
    const _el$3 = _tmpl$().firstChild
    const _anchor$3 = _el$3.firstChild
    const _text$3 = document.createTextNode('')
    _insert(_el$3, _text$3, _anchor$3)
    _bindText(_text$3, () => show && 'visible')
    return _el$3
  })()
}

// Function call
export function FunctionCall() {
  const format = (n: number) => `Count: ${n}`
  return (() => {
    const _el$4 = _tmpl$2().firstChild
    const _anchor$4 = _el$4.firstChild
    const _text$4 = document.createTextNode('')
    _insert(_el$4, _text$4, _anchor$4)
    _bindText(_text$4, () => format(100))
    return _el$4
  })()
}

// Object property access
export function ObjectProp() {
  const user = {
    name: 'Alice',
    age: 30,
  }
  return (() => {
    const _el$5 = _tmpl$().firstChild
    const _anchor$5 = _el$5.firstChild
    const _text$5 = document.createTextNode('')
    _insert(_el$5, _text$5, _anchor$5)
    _bindText(_text$5, () => user.name)
    return _el$5
  })()
}

// Array map
export function ArrayMap() {
  const items = ['a', 'b', 'c']
  return (() => {
    const _el$6 = _tmpl$3().firstChild
    const _anchor$6 = _el$6.firstChild
    const _text$6 = document.createTextNode('')
    _insert(_el$6, _text$6, _anchor$6)
    _bindText(_text$6, () =>
      items.map(item =>
        (() => {
          const _el$7 = _tmpl$4().firstChild
          const _anchor$7 = _el$7.firstChild
          _bindAttr(_el$7, 'key', () => item)
          const _text$7 = document.createTextNode('')
          _insert(_el$7, _text$7, _anchor$7)
          _bindText(_text$7, () => item)
          return _el$7
        })(),
      ),
    )
    return _el$6
  })()
}
