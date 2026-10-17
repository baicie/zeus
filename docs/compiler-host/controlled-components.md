# Web Component 受控与非受控契约

Zeus Web Component 的状态所有权由属性是否存在决定。`value`、`selectedKeys`、`sortColumn` 和 `active*` 等属性在组件初始化和每次更新时都按下面的规则处理；React/Vue wrapper 只负责把外部值写入 custom element，不替换组件内部模型。

## 共同规则

- 受控属性由调用方持有。属性存在时，组件只能根据该值渲染，并通过事件报告用户意图；事件不会偷偷把新的状态写回另一个内部副本。
- 非受控属性只在初始化时读取默认值。之后的用户交互由组件内部模型维护，事件报告新值；外部没有传入受控属性时，后续交互不会把组件伪装成受控组件。
- 从非受控切换到受控时，下一次提交采用外部值。从受控切换回非受控时，组件保留最近一次内部值，除非契约另有说明。
- `defaultValue`、`defaultOpen` 等默认属性不是当前状态的同步源。修改默认属性不会覆盖已经发生的用户交互。
- 属性与事件的配对写入 Manifest：`value`/`value-change`、`selectedKeys`/`selection-change`、`sortColumn` + `sortDirection`/`sort-change`。wrapper 不自行推断配对关系。

## Button

`disabled`、`loading` 和 `pressed` 是受控属性。Button 不维护第二份 pressed 状态：点击时先依据当前属性判断是否可操作，再派发 `press`；调用方决定是否更新 `pressed`。`loading` 与 `disabled` 任一为真时不派发有效的 `press`。

```tsx
const [pressed, setPressed] = createSignal(false)

<z-button
  pressed={pressed()}
  onPress={() => setPressed(value => !value)}
>
  Toggle
</z-button>
```

验收包括：外部不更新 `pressed` 时 DOM 保持外部值；`disabled`/`loading` 阻止交互；重新连接后不会重复监听器。

## Input

`value` 是受控属性，`defaultValue` 是非受控初始值。用户输入只派发 `value-change`，受控场景由父级在事件后写回 `value`；父级不写回时，下一次外部提交仍会恢复原来的受控值。没有 `value` 时，组件维护内部当前值，`defaultValue` 后续变化不覆盖它。

```tsx
const [value, setValue] = createSignal('Ada')

<z-input
  value={value()}
  onValueChange={event => setValue(event.detail.value)}
/>
<z-input defaultValue="Ada" onValueChange={event => log(event.detail.value)} />
```

`formatter` 是函数值，不能被当作 getter 执行；它只处理用户输入。Form-associated 组件还必须分别验证 default/current value、reset 和 native submit。

## Data Grid

`rows`、`columns`、`selectedKeys`、`sortColumn`、`sortDirection`、`activeRowKey` 和 `activeColumnId` 是受控输入。Data Grid 的选择、排序和焦点模型可以响应交互，但最终状态由调用方通过对应属性确认；`selection-change`、`sort-change` 和 `active-cell-change` 只携带建议的新状态。

```tsx
const [selectedKeys, setSelectedKeys] = createSignal<string[]>([])
const [sort, setSort] = createSignal<{ columnId: string; direction: 'asc' | 'desc' }>()

<z-data-grid
  rows={rows()}
  columns={columns()}
  selectedKeys={selectedKeys()}
  sortColumn={sort()?.columnId}
  sortDirection={sort()?.direction}
  onSelectionChange={event => setSelectedKeys(event.detail.selection.keys)}
  onSortChange={event => setSort(event.detail.sort)}
/>
```

没有提供 `selectedKeys` 或排序属性时，组件内部模型才拥有对应状态；外部更新 rows/columns 时，模型根据新引用重建并清理失效的 selection、sort 和 active cell。虚拟化只改变可见节点，不改变状态所有权。

排序属性是字符串属性，受控清空使用 `sortColumn=""`（同时保留
`sortDirection` 的外部写入约定）。把 `sortColumn` 和 `sortDirection` 都设为
`undefined` 会退出受控模式；父组件需要继续拥有排序状态时不能用这个组合表示清空。

## 验收命令

Zeus UI 的单元契约覆盖模型变化原因、undefined 清除和同引用不变行为：

```sh
pnpm --dir ../zeus-ui --filter @zeus-web/data-grid test:unit
```

Zeus 仓库的 Analyzer/Manifest 测试必须同时确认上述 prop/event 配对和默认值策略没有被输出器重新推断。完整三浏览器 packed consumer 仍是发布前的最终验收。
