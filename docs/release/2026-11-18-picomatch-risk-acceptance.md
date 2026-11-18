# picomatch 风险接受记录

生成时间：2026-11-18
适用版本：`@zeus-js/bundler-plugin` 0.2.0-rc.1 及同线后续 RC

## 漏洞

| 项       | 值                                                              |
| -------- | --------------------------------------------------------------- |
| Advisory | GHSA-fc5q-39xc-vjpf                                             |
| CVE      | CVE-2026-112366                                                 |
| 包       | `picomatch`                                                     |
| 严重程度 | **high**                                                        |
| 影响版本 | `<=4.0.7`                                                       |
| 修复版本 | **不存在**（`patched: <0.0.0`，最新发布版为 4.0.7）             |
| 类型     | ReDoS（`analyzeRepeatedExtglob` 对单分支重复 extglob 跳过分析） |

## 已实测复现

```
picomatch('+(*a)')('a'.repeat(30) + '.txt')   → 7777 ms
```

攻击模式 `+(*a)` 对 30 字符输入即阻塞事件循环 7 秒以上，确认可触发。`+(*)`
未触发。

## 依赖路径（三条，全部经 bundler-plugin）

```
packages/web-c/bundler-plugin>picomatch
packages/web-c/bundler-plugin>fast-glob>micromatch>picomatch
examples/admin>@zeus-web/accordion>@zeus-js/output-react-wrapper>@zeus-js/bundler-plugin>picomatch
```

`@zeus-js/bundler-plugin` **是固定发布组成员**，因此这条依赖在真实发布包的
运行时闭包内。已发布的 `0.1.1-beta.20` 同样依赖 `picomatch@^4.0.4`——这不是
新引入的问题。

## 攻击面

`picomatch` 在仓库内只有一个使用点：

```ts
// packages/web-c/bundler-plugin/src/componentTransformFilter.ts:16-17
const isIncluded = picomatch(options.include)
const isExcluded = picomatch(options.exclude)
```

`options.include` / `options.exclude` 的来源链：

```
vite.config.ts 的 components.include / transform.exclude
  ↓ 或
defaults.ts 里的 DEFAULT_COMPONENT_INCLUDE / DEFAULT_TRANSFORM_EXCLUDE
```

**模式只来自构建者自己的配置文件或内置常量**，不来自：

- 被编译的源码内容
- 网络请求
- 构建产物
- 任何第三方输入

默认模式实测最坏 3 ms：

```
'src/**/*.{ts,tsx,js,jsx}', 'components/**/*.{ts,tsx,js,jsx}',
'**/*.test.*', '**/*.spec.*', '**/__tests__/**', '**/*.d.ts',
'src/shared/**', 'node_modules/**', 'dist/**'
```

## 结论

攻击需要攻击者控制 glob 模式。Zeus 里控制 glob 模式的人就是控制 `vite.config.ts`
的人，而那个人本来就能执行任意代码（配置文件在构建时被执行）。**不存在跨信任
边界的攻击路径。**

因此这里接受的是一个**理论上限**，不是可利用缺口：

- 若构建者自己写入 `+(*a)` 这类模式，只会拖慢自己的构建；
- 没有任何输入路径让第三方触发这件事。

## 接受范围与到期

- **范围**：仅 `GHSA-fc5q-39xc-vjpf` / `CVE-2026-112366`，仅 `picomatch`。
- **不是全局豁免**：其他任何 advisory 继续按原规则阻断；`--audit-level=high`
  保持不变，未知高危仍然失败。
- **到期**：`picomatch` 上游发布 `>=4.0.8` 时立即升级并删除此记录；否则每次
  审计仍需人工复核本条。
- **复核条件**：若 `picomatch` 出现新的使用点、或其模式来源从配置文件变为外部
  输入，本接受立即失效，必须重新评估。

## 不做的事

- 不写一个声称修复的 `overrides`（没有可指向的版本）。
- 不把 `audit:prod` 降级为 warning 或 `continue-on-error`。
- 不加宽 `ignoreCves` 到其他 CVE。

## 审计命令

```bash
pnpm audit --prod --audit-level=high --registry=https://registry.npmjs.org
```

只要还有其它 high/critical，命令仍然失败。
