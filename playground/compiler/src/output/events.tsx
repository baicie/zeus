// Event handlers
export function ClickHandler() {
  return (() => {
    _el$.addEventListener("click", () => console.log('clicked'));
    return _el$;
  })();
}

// Multiple event handlers
export function MultipleEvents() {
  return (() => {
    _el$2.addEventListener("mouseenter", () => console.log('enter'));
    _el$2.addEventListener("mouseleave", () => console.log('leave'));
    return _el$2;
  })();
}

// Event with args
export function EventWithArgs() {
  const handleClick = (e: Event, id: number) => {
    console.log(id);
  };
  return (() => {
    _el$3.addEventListener("click", e => handleClick(e, 123));
    return _el$3;
  })();
}

// Input with onChange
export function InputWithChange() {
  return (() => {
    _el$4.addEventListener("change", e => console.log(e.target.value));
    return _el$4;
  })();
}