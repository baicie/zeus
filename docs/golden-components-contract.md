# 四个 Golden Components：现有契约与消费者示例

对应 B-003。冻结 API 位于 `tests/contracts/golden-components.json`，来源为 Zeus UI `1d2c24db27b5` / `0.1.0-beta.32` 的源码与当前构建 Manifest。JSON 包含 source/manifest hash、真实 props/default/attribute、事件、方法、models 和 slots；Dialog 包的六个组件一同记录。未修改 Zeus UI 仓库。

这些是待浏览器验收的契约，不是 G-01～G-04 已全部通过的声明。该冻结合同仍指向 UI beta.32 / Zeus beta.13 的已发布 tarball；当前公开 Zeus registry 版本为 beta.18，但合同重新验收前不能混用冻结依赖，后续发布必须更新 source、Manifest hash、版本和来源证据后才能执行。以下示例是现有 API 的文档用例，尚未完成四个 UI tarball 的完整跨框架浏览器执行。

验收由 `pnpm check:golden-components` 执行。脚本会在每种独立安装工程中先执行无 DOM 的 Node SSR import，再对 native、React 18、React 19 和 Vue 3 在所选浏览器中逐条执行 `requiredBrowserAssertions`，并核对 UI tarball、Zeus runtime 依赖的 registry integrity、SLSA provenance subject/source dependency 和 Sigstore 签名；失败时仍会写出完整报告，供定位问题，不能据此把 contract 状态改成 `passed`。Data Grid 性能断言只记录观察值，不替代 Zeus UI 仓库的版本化基准。`temp/` 下的报告是忽略文件，只能作为本地诊断结果，不能作为持久完成证据。

CI 中的 `Published Golden UI consumers` 步骤只在 `workflow_dispatch` 执行。发布新版本后，先更新本合同并确认 registry、provenance、source commit 与 Manifest hash，再手动运行 CI；普通分支和 pull request 继续由本地产物的 `check:packed-consumers` 覆盖消费者矩阵。

| Golden         | 真实主要接口                                                                                                                   | 必须补齐的浏览器验收                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| G-01 Button    | `press` / `onPress`；detail.nativeEvent；disabled/loading；default/prefix/suffix slot；focus/blur/click                        | 键盘、disabled/loading 不派发、light slot、ready 后方法和清理                            |
| G-02 Input     | value/defaultValue；function formatter；`value-change` / `onValueChange`；Vue `v-model:value`；focus-change；focus/blur/select | 外部 value 更新、用户输入同步、Form submit/reset/required、焦点、函数 identity           |
| G-03 Dialog    | Dialog/Trigger/Content/Close/Title/Description；`open-change` / `onOpenChange`；Vue `v-model:open`；show/close                 | Escape、Tab/Shift+Tab、ARIA title/description、关闭还焦点、卸载后定时器                  |
| G-04 Data Grid | rows/columns/selectedKeys 通过 property；selection/sort/active cell 事件；virtual；scroll/resize/focus 方法                    | 大数据节点数量、滚动与键盘焦点、选中排序、resize；性能仅记录趋势，基准由 UI 仓库单独验收 |

Input 源码没有 `formAssociated` 或 `options.form`，不把内层 input 的 light DOM 行为等同于完整 ElementInternals 表单契约。其 input handler 会先写 host.value 再发事件，严格的 React controlled 回滚语义需要独立证明。

Dialog 的 open 默认 false，`resolveOpen` 又先检查 open 是否存在，因此 defaultOpen 单独设 true 的效果仍有已知边界；示例统一显式管理 open。Manifest 中 open-change.nativeEvent 被标成必选，而源码允许缺失；JSON 保留真实生成结果并记录此差异。

Data Grid 的 virtual 默认 false；rows/columns/selectedKeys 不应写进 HTML JSON attribute。当前生成类型中一些 payload 是 unknown；没有 React/Vue cell renderer API。下面只使用现有数据列与 primitive 值。

## Native HTML / JavaScript

下列模块用于 Vite 等支持包导入的浏览器工程；容器应有可观察尺寸。

```html
<zw-button id="save">保存<span slot="suffix">✓</span></zw-button>
<zw-input id="name" default-value="Ada" aria-label="姓名"></zw-input>
<zw-dialog id="dialog">
  <zw-dialog-trigger>打开详情</zw-dialog-trigger>
  <zw-dialog-content>
    <zw-dialog-title>详情</zw-dialog-title>
    <zw-dialog-description>核对姓名后关闭。</zw-dialog-description>
    <zw-dialog-close>关闭</zw-dialog-close>
  </zw-dialog-content>
</zw-dialog>
<zw-data-grid id="grid" style="display:block;height:300px"></zw-data-grid>

<script type="module">
  import { defineCustomElements as button } from '@zeus-web/button/wc'
  import { defineCustomElements as input } from '@zeus-web/input/wc'
  import { defineCustomElements as dialog } from '@zeus-web/dialog/wc'
  import { defineCustomElements as grid } from '@zeus-web/data-grid/wc'

  for (const register of [button, input, dialog, grid]) register()
  const control = document.querySelector('#name')
  control.formatter = value => value.trimStart()
  control.addEventListener('value-change', event => {
    console.log(event.detail.value)
  })
  document.querySelector('#save').addEventListener('press', () => {
    console.log(control.value)
  })
  const table = document.querySelector('#grid')
  table.rows = [{ id: 'row-1', name: 'Ada' }]
  table.columns = [{ id: 'name', field: 'name', header: '姓名' }]
  table.virtual = true
  await control.componentOnReady()
  control.focus()
</script>
```

## React 18 / React 19 Wrapper

事件参数是 CustomEvent，不是 React SyntheticEvent。React 命名 slot 通过生成的同名 prop 提供；原生消费者则使用 `slot` attribute。

```tsx
import { useState } from 'react'
import { Button } from '@zeus-web/button/react'
import { Input } from '@zeus-web/input/react'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from '@zeus-web/dialog/react'
import { DataGrid } from '@zeus-web/data-grid/react'

const rows = [{ id: 'row-1', name: 'Ada' }]
const columns = [{ id: 'name', field: 'name', header: '姓名' }]

export function GoldenExamples() {
  const [value, setValue] = useState('Ada')
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button suffix={<span>✓</span>} onPress={() => console.log(value)}>
        保存
      </Button>
      <Input
        value={value}
        ariaLabel="姓名"
        formatter={text => text.trimStart()}
        onValueChange={event => setValue(event.detail.value)}
      />
      <Dialog open={open} onOpenChange={event => setOpen(event.detail.open)}>
        <DialogTrigger>打开详情</DialogTrigger>
        <DialogContent>
          <DialogTitle>详情</DialogTitle>
          <DialogDescription>核对姓名后关闭。</DialogDescription>
          <DialogClose>关闭</DialogClose>
        </DialogContent>
      </Dialog>
      <DataGrid
        rows={rows}
        columns={columns}
        virtual
        style={{ display: 'block', height: 300 }}
      />
    </>
  )
}
```

## Vue 3 Wrapper

`v-model:value` 与 `v-model:open` 来自当前 Manifest models。没有声明 model 的组件不能据此推导任意 `v-model` 用法。

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Button } from '@zeus-web/button/vue'
import { Input } from '@zeus-web/input/vue'
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from '@zeus-web/dialog/vue'
import { DataGrid } from '@zeus-web/data-grid/vue'

const value = ref('Ada')
const open = ref(false)
const rows = [{ id: 'row-1', name: 'Ada' }]
const columns = [{ id: 'name', field: 'name', header: '姓名' }]
const formatName = (text: string) => text.trimStart()
</script>

<template>
  <Button @press="console.log(value)">
    保存<template #suffix><span>✓</span></template>
  </Button>
  <Input v-model:value="value" :formatter="formatName" aria-label="姓名" />
  <Dialog v-model:open="open">
    <DialogTrigger>打开详情</DialogTrigger>
    <DialogContent>
      <DialogTitle>详情</DialogTitle>
      <DialogDescription>核对姓名后关闭。</DialogDescription>
      <DialogClose>关闭</DialogClose>
    </DialogContent>
  </Dialog>
  <DataGrid
    :rows="rows"
    :columns="columns"
    :virtual="true"
    style="display:block;height:300px"
  />
</template>
```
