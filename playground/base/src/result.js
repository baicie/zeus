import { createTemplate, cloneTemplate, bindElement } from "@zeus-js/runtime";
function App() {
  const name = 'Zeus';
  const isVisible = true;
  const count = 0;
  return (() => {
    const _tmpl$ = cloneTemplate("_tmpl$0");
    const _el$ = _tmpl$.content();
    bindElement(_el$, "attribute", "className", isVisible ? 'visible' : 'hidden');
    bindElement(_el$, "child", "", (() => {
      const _tmpl$ = cloneTemplate("_tmpl$1");
      const _el$ = _tmpl$.content();
      bindElement(_el$, "text", "", name);
      return _el$;
    })());
    bindElement(_el$, "child", "", (() => {
      const _tmpl$ = cloneTemplate("_tmpl$2");
      const _el$ = _tmpl$.content();
      bindElement(_el$, "text", "", count);
      return _el$;
    })());
    bindElement(_el$, "child", "", (() => {
      const _tmpl$ = cloneTemplate("_tmpl$3");
      const _el$ = _tmpl$.content();
      bindElement(_el$, "event", "onClick", () => console.log('Button clicked!'));
      bindElement(_el$, "attribute", "disabled", count === 0);
      return _el$;
    })());
    bindElement(_el$, "text", "", isVisible && (() => {
      const _tmpl$ = cloneTemplate("_tmpl$4");
      const _el$ = _tmpl$.content();
      return _el$;
    })());
    return _el$;
  })();
}
export default App;