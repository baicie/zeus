# 发布证据链与部署事务审计

日期：2026-11-14  
基线：Core `69f494f2`  
范围：`scripts/release/build-info.ts`、`deployment-*.ts`

---

## 0. 结论

**证据链是闭环的。** 本轮最初判断「artifactDigest 从未从磁盘重算」——**这个判断是错的**，
我在读完 `deployment-acceptance.ts:705-775` 后撤回了它。

下面记录核查过程，包括那次误判，因为它说明了为什么「读到一半就下结论」是危险的。

---

## 1. 逐项核查

| #   | 问题                            | 实现                                                       | 判定        |
| --- | ------------------------------- | ---------------------------------------------------------- | ----------- |
| 1   | Core SHA 真实对应构建           | `build-info.ts` 写入 `coreCommit`，`verifyProvenance` 比对 | **PASS**    |
| 2   | UI SHA 真实对应构建             | 同上，`uiCommit`                                           | **PASS**    |
| 3   | artifactDigest 覆盖全部部署文件 | `collectArtifactFiles` 递归遍历，逐文件 sha256             | **PASS**    |
| 4   | image digest 绑定正确           | `verifyBuildInfo` 比对 `imageDigest`                       | **PASS**    |
| 5   | provenance 能否被手写绕过       | **不能**：验收时重新下载每个文件重算                       | **PASS**    |
| 6   | Stage 1 / Stage 2 是否断链      | 两阶段共用 `manifest` + `provenance`                       | **PASS**    |
| 7   | 失败回滚是否恢复旧版本          | 事务快照 + `--rollback`                                    | **PASS**    |
| 8   | 并发部署是否互相覆盖            | `acquireDeploymentLock` 拒绝并发                           | **PASS**    |
| 9   | 备份恢复是否有失败测试          | 见 §4                                                      | **PARTIAL** |
| 10  | 部署中断是否留半完成态          | 事务状态机 + 恢复                                          | **PASS**    |
| 11  | 旧 artifact 是否被误用          | digest 不匹配即拒绝                                        | **PASS**    |
| 12  | approval 是否绑定候选 SHA       | `validateRcApproval` 绑定 core/ui/version/digest           | **PASS**    |

## 2. 我误判的那一处

**初始判断**：`verifyBuildInfo` 拿 `expected.artifactDigest` 与 `value.artifactDigest` 比对，
两个值都来自文件，没有任何一处从磁盘重算——所以证据链是空的。

**实际**：`deployment-acceptance.ts` 在调用 `verifyBuildInfo` 之后，紧接着调用
`verifyServedArtifact`：

```ts
const response = await fetchChecked(fileUrl, mode, manifest)
if (response.bytes.byteLength !== bytes) throw new Error(…)
const actual = createHash('sha256').update(response.bytes).digest('hex')
if (actual !== sha256) throw new Error(`served file ${filePath} does not match its sha256`)
…
const digest = computeArtifactDigest(files)
if (digest !== buildInfo.artifactDigest) {
  throw new Error('served files do not reproduce the build-info digest')
}
```

**每一个部署文件都被重新下载、重新哈希、重新汇总。** 一个被篡改的资产配上原样复制的
`build-info.json` 无法通过。注释也写明了这一点。

**教训**：`verifyBuildInfo` 只做「记录之间是否自洽」，`verifyServedArtifact` 做「记录与字节是否
一致」。两者是分层设计，不是缺口。只看前者的签名会得出错误结论。

## 3. 本轮补的测试

`scripts/release/__tests__/build-info.spec.ts` 新增 4 个用例，把「从磁盘重算」的行为固定下来：

- 文件被改动后，重算的 digest 不等于记录的；
- 多出一个文件后，重算的 digest 不等于记录的；
- 删掉一个文件后，重算的 digest 不等于记录的；
- 未改动时重算结果与记录一致。

这四条保护的是 `collectArtifactFiles` + `computeArtifactDigest` 的组合行为，
`verifyServedArtifact` 依赖它们。

## 4. 未覆盖：备份恢复的失败路径

`deployment-transaction.ts` 有快照与回滚，也有锁。但我没有找到「备份本身失败时是否安全中止」的
负向测试。这是 `PARTIAL` 而非 `PASS`。

**为什么本轮不补**：写这条测试需要构造一个会失败的备份（磁盘满、权限拒绝），并驱动整个事务状态机。
在本地环境模拟不可靠，容易写成「看起来在测但实际测的是 mock」。

## 5. 剩余风险

| 风险                                    | 级别 | 说明                           |
| --------------------------------------- | ---- | ------------------------------ |
| 备份失败路径无测试                      | P2   | 见 §4                          |
| `verifyServedArtifact` 未在本轮实测运行 | P2   | 需要一次真实部署；本轮禁止部署 |
| Stage 2 中途失败的恢复未实测            | P2   | 同上                           |

**本审计验证的是代码逻辑，不是运行时行为。** 所有 `PASS` 都指「代码在这个问题上是正确的」，
不指「在生产环境验证过」。
