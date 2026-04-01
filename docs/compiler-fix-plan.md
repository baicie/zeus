# Zeus JSX 编译器整改方案

## 问题概述

当前 Zeus JSX 编译器生成的代码与期望输出存在较大差距，需要修复以生成正确的 DOM 操作代码。

### 期望输出

```javascript
var _tmpl$1 = template('<div><nav></nav><main></main></div>');
var NAV_ITEMS = [...];

function NavLink(props) {
  const a = document.createElement('a');
  a.href = '#' + props.path;
  a.className = 'nav-link';
  a.innerHTML = '...';
  a.addEventListener('click', function(e) {
    e.preventDefault();
    router.push(props.path);
  });
  effect(() => {
    if (router.currentRoute.path === props.path) a.classList.add('active');
    else a.classList.remove('active');
  });
  return a;
}

function App() {
  return (() => {
    const _el$ = _tmpl$1();
    const _el$1 = _el$.firstChild;
    const _el$2 = _el$1.nextSibling;
    insert(_el$1, NAV_ITEMS.map(item => NavLink(item)), _el$2);
    insert(_el$2, RouterView);
    return _el$;
  })();
}
```

### 当前输出

```javascript
// ❌ 问题 1: insert 在模块顶层
var _tmpl$1 = template('<div><nav></nav><main></main></div>');
insert(_tmpl$1, NAV_ITEMS.map(item => NavLink(item)), null);

var NAV_ITEMS = [...];

function App() {
  // ❌ 问题 2: 直接返回模板，没有节点缓存和 insert
  return _tmpl$1();
}
```

---

## 🔑 关键发现：SolidJS 不使用任何占位符！

对比 [SolidJS 编译结果](playground/solidjs/dist/assets/index-CcltYgjb.js)：

```javascript
// SolidJS：模板是纯静态 HTML
var _tmpl$5 = template(`<li>...<span></span>...</li>`);

function TodoItem(props) {
    return (() => {
        // 节点通过遍历定位
        var _el$3 = _el$.firstChild.nextSibling.nextSibling;
        // insert 在函数内部，anchor 可选（没有也可以）
        insert(_el$3, () => props.todo.text);
        return _el$;
    })();
}
```

**结论：**
- 模板是纯静态 HTML，**不需要任何占位符**
- 节点位置通过 `.firstChild` / `.nextSibling` 遍历确定
- insert 在组件函数内部调用

---

## 问题汇总

| 优先级 | 问题 | 期望 | 当前 |
|--------|------|------|------|
| 🔴 P0 | insert 位置 | 组件函数内部 | 模块顶层 |
| 🔴 P0 | 节点缓存 | 有 | 无 |
| 🔴 P0 | anchor 参数 | 下一个兄弟节点 | `null` |
| 🟡 P1 | NavLink onclick | addEventListener | 缺失 |
| 🟡 P1 | 静态数据排序 | 组件之前 | 组件之后 |

---

## 整改方案

### 1. 模板生成：纯静态 HTML

生成不含任何占位符的静态 HTML：

```rust
// 之前：<div><!--[0]--></div>
// 之后：<div></div>
```

### 2. 节点缓存：DOM 遍历

在组件函数内部生成遍历代码：

```javascript
return (() => {
  const _el$ = _tmpl$1();      // 根节点
  const _el$1 = _el$.firstChild;   // 第一个子节点
  const _el$2 = _el$1.nextSibling; // 第二个子节点
  // ...
  return _el$;
})();
```

### 3. insert 调用：IIFE 内部

```javascript
return (() => {
  const _el$ = _tmpl$1();
  const _el$1 = _el$.firstChild;
  const _el$2 = _el$1.nextSibling;
  
  // insert(父节点, 内容, 锚点)
  insert(_el$1, NAV_ITEMS.map(item => NavLink(item)), _el$2);
  insert(_el$2, RouterView);
  
  return _el$;
})();
```

---

## 实施步骤

### Phase 1: 移除占位符
- [ ] 移除 `<!--[N]-->` 占位符生成
- [ ] 生成纯静态 HTML

### Phase 2: 生成节点缓存
- [ ] 分析 JSX children 结构
- [ ] 生成遍历代码 `_el$1.firstChild.nextSibling`

### Phase 3: IIFE 和 insert
- [ ] 在函数内部生成 insert 调用
- [ ] 计算正确的 anchor 参数

### Phase 4: 事件处理
- [ ] 生成 `addEventListener` 调用

---

## 参考: SolidJS dom-expressions

| 特性 | SolidJS | Zeus |
|------|---------|------|
| 模板 | 纯静态 HTML | 纯静态 HTML |
| 节点缓存 | `_el$1.firstChild` | `_el$1.firstChild` |
| insert | `insert(parent, children, anchor?)` | `insert(parent, children, anchor?)` |
| effect | `createEffect` | `effect` |
| 占位符 | ❌ 无 | ❌ 无需 |
