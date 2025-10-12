 const isBrowser = typeof window !== 'undefined' && typeof document !== 'undefined';
const $$EVENTS = "_$DX_DELEGATE";

// Extend Document interface to include our custom property
declare global {
  interface Document {
    [$$EVENTS]?: Set<string>;
  }
}
// 创建元素
function createElement(tag: string): HTMLElement {
  if (!isBrowser) {
    throw new Error('DOM operations are only available in browser environment');
  }
  return document.createElement(tag);
}

// 创建文本节点
function createText(text: string): Text {
  if (!isBrowser) {
    throw new Error('DOM operations are only available in browser environment');
  }
  return document.createTextNode(text);
}

// 插入节点
function insert(parent: Node, node: Node, anchor?: Node | null): void {
  parent.insertBefore(node, anchor || null);
}

// 移除节点
function remove(node: Node): void {
  const parent = node.parentNode;
  if (parent) {
    parent.removeChild(node);
  }
}

// 设置文本
function setText(node: Text, text: string): void {
  node.data = text;
}

// 设置属性
function setAttribute(node: HTMLElement, name: string, value: any): void {
  if (value == null || value === false) {
    node.removeAttribute(name);
  } else {
    node.setAttribute(name, value === true ? '' : String(value));
  }
}

// 移除属性
function removeAttribute(node: HTMLElement, name: string): void {
  node.removeAttribute(name);
}

// 设置 class
function setClass(node: HTMLElement, className: string): void {
  if (className) {
    node.className = className;
  } else {
    node.removeAttribute('class');
  }
}

// 设置 style
function setStyle(node: HTMLElement, style: Partial<CSSStyleDeclaration>): void {
  Object.assign(node.style, style);
}

function eventHandler(e) {
  if (sharedConfig.registry && sharedConfig.events) {
    if (sharedConfig.events.find(([el, ev]) => ev === e)) return;
  }

  let node = e.target;
  const key = `$$${e.type}`;
  const oriTarget = e.target;
  const oriCurrentTarget = e.currentTarget;
  const retarget = value =>
    Object.defineProperty(e, "target", {
      configurable: true,
      value
    });
  const handleNode = () => {
    const handler = node[key];
    if (handler && !node.disabled) {
      const data = node[`${key}Data`];
      data !== undefined ? handler.call(node, data, e) : handler.call(node, e);
      if (e.cancelBubble) return;
    }
    node.host &&
      typeof node.host !== "string" &&
      !node.host._$host &&
      node.contains(e.target) &&
      retarget(node.host);
    return true;
  };
  const walkUpTree = () => {
    while (handleNode() && (node = node._$host || node.parentNode || node.host));
  };

  // simulate currentTarget
  Object.defineProperty(e, "currentTarget", {
    configurable: true,
    get() {
      return node || document;
    }
  });
  // cancel hydration
  if (sharedConfig.registry && !sharedConfig.done) sharedConfig.done = _$HY.done = true;

  if (e.composedPath) {
    const path = e.composedPath();
    retarget(path[0]);
    for (let i = 0; i < path.length - 2; i++) {
      node = path[i];
      if (!handleNode()) break;
      if (node._$host) {
        node = node._$host;
        // bubble up from portal mount instead of composedPath
        walkUpTree();
        break;
      }
      if (node.parentNode === oriCurrentTarget) {
        break; // don't bubble above root of event delegation
      }
    }
  }
  // fallback for browsers that don't support composedPath
  else walkUpTree();
  // Mixing portals and shadow dom can lead to a nonstandard target, so reset here.
  retarget(oriTarget);
}

export function delegateEvents(eventNames: string[], document: Document = window.document): void {
  const e = document[$$EVENTS] || (document[$$EVENTS] = new Set());
  for (let i = 0, l = eventNames.length; i < l; i++) {
    const name = eventNames[i];
    if (!e.has(name)) {
      e.add(name);
      document.addEventListener(name, eventHandler);
    }
  }
}

 