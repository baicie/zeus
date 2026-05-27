import { template as _$template } from "r-dom";
import { delegateEvents as _$delegateEvents } from "r-dom";
var _tmpl$ = /*#__PURE__*/_$template(`<button>Click me`),
  _tmpl$2 = /*#__PURE__*/_$template(`<div>Hover me`),
  _tmpl$3 = /*#__PURE__*/_$template(`<button>Click`),
  _tmpl$4 = /*#__PURE__*/_$template(`<input>`),
  _tmpl$5 = /*#__PURE__*/_$template(`<form><button type=submit>Submit`),
  _tmpl$6 = /*#__PURE__*/_$template(`<div><button>Button 1</button><button>Button 2`);
// Click handler
export function ClickHandler() {
  return (() => {
    var _el$ = _tmpl$();
    _el$.$$click = () => console.log('clicked');
    return _el$;
  })();
}

// Multiple event handlers
export function MultipleEvents() {
  return (() => {
    var _el$2 = _tmpl$2();
    _el$2.addEventListener("mouseleave", () => console.log('leave'));
    _el$2.addEventListener("mouseenter", () => console.log('enter'));
    return _el$2;
  })();
}

// Event with args
export function EventWithArgs() {
  const handleClick = (e: Event, id: number) => {
    console.log(id);
  };
  return (() => {
    var _el$3 = _tmpl$3();
    _el$3.$$click = e => handleClick(e, 123);
    return _el$3;
  })();
}

// Input with onInput
export function InputWithChange() {
  return (() => {
    var _el$4 = _tmpl$4();
    _el$4.$$input = e => console.log(e.currentTarget.value);
    return _el$4;
  })();
}

// Prevent default
export function PreventDefault() {
  return (() => {
    var _el$5 = _tmpl$5();
    _el$5.addEventListener("submit", e => e.preventDefault());
    return _el$5;
  })();
}

// Delegated event (camelCase -> kebab)
export function DelegatedEvents() {
  return (() => {
    var _el$6 = _tmpl$6(),
      _el$7 = _el$6.firstChild,
      _el$8 = _el$7.nextSibling;
    _el$7.$$click = () => console.log('btn1');
    _el$8.$$click = () => console.log('btn2');
    return _el$6;
  })();
}
_$delegateEvents(["click", "input"]);