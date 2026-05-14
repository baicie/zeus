// Dynamic expressions in JSX
export function DynamicExpr() {
  const name = 'World';
  const count = 42;
  return (() => {
    insert(_el$, name);
    return _el$;
  })();
}

// Ternary expression
export function TernaryExpr() {
  const flag = true;
  return (() => {
    insert(_el$2, flag ? 'yes' : 'no');
    return _el$2;
  })();
}

// Logical AND expression
export function LogicalExpr() {
  const show = true;
  return (() => {
    insert(_el$3, show && 'visible');
    return _el$3;
  })();
}

// Function call
export function FunctionCall() {
  const format = (n: number) => `Count: ${n}`;
  return (() => {
    insert(_el$4, format(100));
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
    insert(_el$5, user.name);
    return _el$5;
  })();
}

// Array map
export function ArrayMap() {
  const items = ['a', 'b', 'c'];
  return (() => {
    insert(_el$6, items.map(item => (() => {
      setAttr(_el$7, "key", item);
      insert(_el$7, item);
      return _el$7;
    })()));
    return _el$6;
  })();
}