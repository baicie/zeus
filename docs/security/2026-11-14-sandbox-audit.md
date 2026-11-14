# Playground Sandbox 安全审计

日期：2026-11-14  
基线：Core `69f494f2` + UI `89fc93ca`  
范围：`examples/playground-editor`、`packages/devtools/playground-engine`、`examples/admin` 的安全面

---

## 0. 结论

**未发现可利用的沙箱逃逸或跨源缺陷。** 现有设计在关键点上是对的，且多数是我预期会错的地方。

本轮**没有修改沙箱行为**，只补了两条测试把「重放必须由调用方去重」这个契约固定下来。

---

## 1. 逐项核查

| #   | 攻击面                                | 实现                                                                                           | 判定                       |
| --- | ------------------------------------- | ---------------------------------------------------------------------------------------------- | -------------------------- |
| 1   | iframe 是否 opaque origin             | `sandbox="allow-scripts"`，无 `allow-same-origin`；服务端额外发 `CSP: sandbox allow-scripts`   | **PASS**                   |
| 2   | 沙箱能否访问 Host DOM                 | opaque origin + 无 `allow-same-origin` → 跨源，无法访问                                        | **PASS**                   |
| 3   | postMessage 是否验 source/origin/结构 | 两侧都验：`event.source`、`event.origin`、`sessionId`、`channel`、`version`、逐 kind 的 schema | **PASS**                   |
| 4   | 消息重放                              | `requestId` 匹配后调用方清空 `pending`，重放无接收者                                           | **PASS**（本轮补测试固化） |
| 5   | 跨会话消息污染                        | `message.sessionId !== this.sessionId` 直接丢弃                                                | **PASS**                   |
| 6   | Worker 资源泄漏                       | iframe 超时后 `resetFrame()` 整体销毁                                                          | **PASS**                   |
| 7   | 合法代码触发无限循环                  | 五种循环形态全部插桩（`while`/`do`/`for`/`for-in`/`for-of`）                                   | **PASS**                   |
| 8   | 绕过循环预算                          | 累积式预算，非窗口式；见 §2                                                                    | **PASS**                   |
| 9   | 递归 / 异步耗尽资源                   | 递归无插桩；靠宿主超时兜底                                                                     | **PARTIAL**（见 §3）       |
| 10  | 访问内部网络                          | `connect-src 'self'`；opaque origin 无网络凭据                                                 | **PASS**                   |
| 11  | 访问父窗口凭据                        | 跨源 + `HttpOnly` cookie 不可读                                                                | **PASS**                   |
| 12  | CSP 是否覆盖生产                      | `examples/playground-editor/deploy/nginx.conf` 有两条独立 CSP（host / sandbox）                | **PASS**                   |
| 13  | Sandbox 与 Host 是否跨源              | `playground.moonbyte.top` vs `panel.moonbyte.top`，且 sandbox 侧强制 opaque                    | **PASS**                   |
| 14  | 导航 / 下载 / 弹窗                    | `allow-scripts` 不含 `allow-popups`、`allow-top-navigation`、`allow-downloads`                 | **PASS**                   |

## 2. 循环预算为何不是显而易见的实现

`packages/devtools/playground-engine/src/preview.ts:262` 的 `loopBudgetPlugin` 解决了一对互相冲突的需求：

- **紧循环**必须被杀掉。它从不 yield，所以任何「两次迭代之间的间隔」都几乎是 0；
- **合法异步循环**必须活下来。`while (n < 8) { await sleep(200) }` 的两次迭代间隔是 200ms。

朴素做法都不成立：

| 做法                      | 失败方式                               |
| ------------------------- | -------------------------------------- |
| 从进入循环起算 wall clock | 杀掉合法异步循环（await 的时间被计入） |
| 每轮重置时间戳            | 失控循环每秒重置百万次，永不触发       |

实际实现是**累积式**：每次迭代把「自上一轮以来的耗时」累加到 `__zeusBudgetSpent`。紧循环每轮微秒级但轮次极多，总额很快超过 1000ms；异步循环每轮只花微秒，await 的时间不计入。

注释里记录了这些失败尝试，这一点值得保留——它防止后人「简化」回错误实现。

## 3. 递归：一个有意的缺口

**现象**：`function f() { return f() }` 不触发循环预算，直接栈溢出。

**为什么不是 P0**：

- 执行发生在 opaque-origin iframe 内，栈溢出终止的是该 iframe 的执行，不是宿主页面；
- 宿主侧有 `setTimeout` 超时，到点 `resetFrame()` 销毁整个 iframe；
- 攻击者能造成的后果是「自己的预览崩了」，与宿主资源无关。

**为什么仍要记录**：它和循环预算给人的印象不一致。文档说「预算保护沙箱」，读代码的人会以为递归也被覆盖。

**建议**（本轮不实施）：给递归加一个深度计数需要在函数入口插桩，改动面比循环大得多，而且在 opaque iframe + 宿主超时的组合下收益有限。若要做，应先写一个「递归是否真的能拖垮宿主」的实测。

## 4. 本轮补的测试

`packages/devtools/playground-engine/__tests__/sandbox.spec.ts`：

1. **重放解析结果与原消息相同**——证明解析器不做单次消费，因此调用方的 `pending` 清空是唯一防线。这防止未来有人「优化」掉调用方的去重。
2. **不同 session 的消息也能解析**——同理，`message.sessionId !== this.sessionId` 这个检查不能删。

这两条测试的价值不在于测出 bug，而在于把「为什么这行代码不能删」写进测试。

## 5. 未执行

| 项                         | 原因                                        |
| -------------------------- | ------------------------------------------- |
| 真实浏览器内的沙箱逃逸尝试 | 需要完整 Playground 构建 + 三引擎；本轮未做 |
| 生产环境 CSP 实测          | 需要访问线上，且本轮禁止部署                |
| Worker 崩溃注入            | 沙箱当前不使用独立 Worker，用的是 iframe    |

**因此本审计不能声称「生产已验证」。** 它验证的是代码层面的设计。

## 6. 剩余风险

| 风险                               | 级别 | 说明                                      |
| ---------------------------------- | ---- | ----------------------------------------- |
| 递归不触发预算                     | P3   | 见 §3，有宿主超时兜底                     |
| 沙箱逃逸未经真实浏览器验证         | P2   | 需要一次三引擎对抗测试                    |
| `frame-ancestors` 依赖部署配置正确 | P2   | nginx.conf 里有，但配置漂移不会被代码发现 |
