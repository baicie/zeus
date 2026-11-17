# Firefox flaky：ai-workbench / P0, BYOK and CSP gates

记录时间：2026-11-17
状态：**未定位根因**。重跑通过不等于修复。

## 1. 现象

UI PR #148（head `a1c37afdbdf1a6c2e28acc3c991ba2ebc6b26535`）上的
`ai-workbench / P0, BYOK and CSP gates (three engines)` 失败。

重跑后该 job 通过：

```
gh run rerun 44031149916 --failed
→ pass 2m38s
```

## 2. 已知证据

从下载的运行日志 `/tmp/byok.log` 解析：

```
grep -oE '"browser": "[a-z]+"|"status": "(passed|failed)"' /tmp/byok.log | paste - - | nl
```

结果共 9 条，按三组（chromium / firefox / webkit）× 三个场景排列。唯一的失败是第三组中的 firefox：

| 组  | chromium | firefox    | webkit |
| --- | -------- | ---------- | ------ |
| 1   | passed   | passed     | passed |
| 2   | passed   | passed     | passed |
| 3   | passed   | **failed** | passed |

**关键特征**：该场景下所有断言均返回 `"ok": true`。失败只出现在 Playwright 层的 `"status"`，不是任何一条业务断言。

## 3. 这说明什么

不是代码缺陷。断言全绿而 Playwright 报 failed，意味着失败发生在断言之外——浏览器崩溃、context 关闭、超时，或者 Playwright 自身状态问题。

同一组的 chromium 和 webkit 通过，排除了测试逻辑本身对三个引擎都有问题。

## 4. 未获取的证据（重要）

任务要求保存 trace、退出码、runner 信息。以下项**没有拿到**：

| 项               | 原因                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Playwright trace | 运行 artifact 未下载。2026-11-17 尝试访问 GitHub API 时持续 TLS handshake timeout，`gh api repos/baicie/zeus-ui/actions/runs/44031149916` 无法完成 |
| job 退出码       | 同上，`gh api .../jobs` 不可达                                                                                                                     |
| runner 信息      | 同上                                                                                                                                               |
| 完整 stderr      | `/tmp/byok.log` 是 job 日志，不是 Playwright 原始输出                                                                                              |

这些缺口必须补上，否则下一节的处理建议无法验证。

## 5. 建议的下一步（未执行）

1. 网络恢复后，下载该 run 的 artifacts：

   ```
   gh run download 44031149916 --repo baicie/zeus-ui
   ```

   Playwright trace 通常在 `test-results/` 或 CI 上传的 artifact 中，可用
   `npx playwright show-trace <trace.zip>` 打开。

2. 如果 trace 不存在，说明 CI 未配置 `--trace on-first-retry` 或 `retain-on-failure`。
   这是独立的可改进项：没有 trace 的 flaky 无法定位。

3. 在复现前不要做任何"修复"。当前证据只能说明它不是断言失败，
   不足以说明原因。

## 6. 明确不成立的结论

- ❌「重跑通过，所以修好了」——重跑通过只说明这次没触发，不说明原因消失
- ❌「Firefox 不稳定，忽略即可」——没有证据表明是 Firefox 自身问题；
  也可能是测试环境的资源竞争，那会影响所有引擎

## 7. 对 RC 的影响

这个 job 不在 `release.yml` 的 `REQUIRED_WORKFLOWS` 里
（只有 `ci.yml` 和 `compiler-native.yml`）。所以它不阻塞 Core 发布。

但它阻塞 UI 的 PR 合并，因此会阻塞 Phase 2（Pair）所需的 UI 候选提交。
在这条 flaky 有根因之前，每次 UI 候选提交都有概率卡在这里。
