# 风险登记表

等级：**高** = 阻断迁移或可能造成生产事故；**中** = 需要专门处理但不阻断；**低** = 记录在案。

| ID   | 风险                                                                                            | 等级   | 影响                                                                                       | 证据                                                                                                                                   | 控制措施                                                                                          |
| ---- | ----------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| R-01 | **0.2.0 线从未发布到 npm**，ecosystem 无法只消费已发布包                                        | **高** | Phase 4 无法启动；强行迁移只能靠 vendor 或源码依赖，违反核心约束                           | `npm view @zeus-js/zeus versions` 180 个版本无 `0.2.0`；源码 `0.2.0-rc.3`                                                              | 先发布 0.2.0 RC 到 registry，再启动 Phase 4；或为迁移期开受控例外并记录（见 Q1）                  |
| R-02 | **`@zeus-web/*` 最新发布是 `beta.34`，admin 用的是 vendor 的 `beta.35`**                        | **高** | 迁移后 admin 若改回 registry 版本，Dialog 修复会丢失                                       | `npm view @zeus-web/dialog dist-tags` → `beta: 0.1.0-beta.34`；`vendor/zeus-web-dialog/provenance.json` note                           | 先发布 `@zeus-web/*@0.1.0-beta.35`，验证 dialog 修复，再删 vendor                                 |
| R-03 | **framework 的 30 条断言在 admin 迁走后失去宿主**                                               | **高** | Router/Query/i18n/Runtime ref 契约/DevTools 的集成验证会消失，框架层出现证据断层           | `03-test-ownership-map.md` §1.2；zeus-ui 16 个 examples 零使用 `@zeus-js/router`                                                       | ecosystem 必须保留一个 zeus-js 集成验证应用；或把 admin 的 framework 组下沉为 zeus 的独立集成夹具 |
| R-04 | **`create-zeus` 模板反向依赖 `@zeus-web/button`** 且随包发布                                    | **高** | 只搬 admin 无法消除反向依赖；`zeus` 的发布物始终依赖 UI 仓                                 | `packages/create/create-zeus/templates/webc-consumer-ts/package.json:13`；`files: ['dist','templates']`                                | 迁移清单必须包含这条；选项：模板改为消费 `@zeus-js/*` 自建示例，或承认该依赖并写入兼容矩阵        |
| R-05 | **3 个生产部署、4 个镜像，设计包只规划了 1 个**                                                 | **高** | 迁移范围被低估 3 倍；Playground 与 AI Workbench 的归属未定                                 | `admin-image.yml:480`、`playground-image.yml:231`、`ai-workbench-image.yml:448`                                                        | Phase 1 必须为每个产品单独定归属、切换顺序、回滚方案                                              |
| R-06 | **`demos-pages.yml` 无法留在任一侧**                                                            | **高** | 它同时构建两仓 demo 并发布到一个站点；拆仓后必然需要一个跨仓编排位置                       | `demos-pages.yml:98-107,137-145,211-214`                                                                                               | 整体迁 ecosystem；或保留在 zeus 但明确接受跨仓构建                                                |
| R-07 | **`deployment-acceptance.ts` import 应用服务端常量**                                            | **高** | 搬 admin 会打断 zeus 的部署验收脚本                                                        | `scripts/release/deployment-acceptance.ts:39`                                                                                          | 迁移时把 `CSRF_COOKIE`/`SESSION_COOKIE` 下沉为文档化契约，或复制常量并加注释                      |
| R-08 | **examples 被 4 个检查脚本 + 根 `site:check` 双重锁定**                                         | 中     | 搬 zeus-ui 的 examples 会打断 `site:check`、`showcase:ci`、registry 同步链路               | `check-showcase-implementation.ts:228`、`check-showcase-metadata.ts:166`、`check-product-contract.ts:624-700`、`check-examples.ts:157` | 若搬 examples，必须同批改这 4 个脚本 + 根 scripts；建议不搬                                       |
| R-09 | **vendor 现在不能删**                                                                           | 中     | 提前删会导致 admin 的 Dialog 回归（Escape 只能关一次、WebKit 焦点陷阱失效）                | `provenance.json` note；`docs/release/0.2.0-r6-post-merge-addendum.md:67-93`                                                           | 以 R-02 的发布为前提；删除前跑 `check-dialog-interaction` 三引擎                                  |
| R-10 | **`@zeus-ui` scope 被 zeus 仓占用**（`@zeus-ui/headless` private + `@zeus-ui/registry` 可发布） | 中     | 三仓拆分后出现第四个事实 scope；`@zeus-ui/registry` 与 `@zeus-web/registry` 是两个不同产品 | `examples/headless/package.json:2`；`packages/create/registry/package.json`                                                            | 拆仓时明确 `@zeus-ui` 归属；建议 zeus 仓的两个包改名或迁移                                        |
| R-11 | **`zeus-ui` 无法用自己的仓库名发布**（npm `zeus-ui` 被 zeus 仓的 `0.0.1` 占用）                 | 中     | UI 产品仓的品牌与 npm 包名不一致                                                           | `npm view zeus-ui dist-tags` → `latest: 0.0.1`；`zeus-ui/package.json` name = `zeus-ui-workspace`                                      | 若需要，先弃用 zeus 仓的 `zeus-ui` 包名                                                           |
| R-12 | **`playground-pages.yml:97` 的 `--ui-commit` 传 Core SHA**                                      | 中     | 发布记录里的 UI commit 是错的（R6-A 同型缺陷）                                             | `playground-pages.yml:97`                                                                                                              | 迁移前修掉；或在 ecosystem 重建时按 demos-pages 的做法解析真 SHA                                  |
| R-13 | **beta 频道与强制 `online` 配对的契约矛盾**                                                     | 中     | 迁移后第一次 beta 发布可能失败                                                             | `zeus-ui/release-pairing/README.md:67-68` vs `publish.yml:93-96`                                                                       | Phase 1 澄清；建议以 workflow 的强制 online 为准，修正 README                                     |
| R-14 | **SBOM 从不作为 artifact 上传；zeus-ui 不产 SBOM**                                              | 中     | 跨 run 无法审计发布物；设计包的「证据链迁移」无法直接满足                                  | `check-sbom.ts` → `temp/sbom/`；`ai-workbench-image.yml:153,178` `provenance: false`                                                   | ecosystem 新建镜像级 SBOM 与 provenance                                                           |
| R-15 | **三个镜像的体积证据只有 step summary**                                                         | 中     | 过期即消失，不可比对                                                                       | `admin-image.yml:283-289`；`ai-workbench-image.yml:186-216`                                                                            | 加 `upload-artifact`                                                                              |
| R-16 | **`playground-image.yml` 无 revision label 校验**                                               | 中     | 无法证明部署的是本次构建                                                                   | `playground-image.yml:448-454` vs `admin-image.yml:693-700`                                                                            | 复用 admin 的做法                                                                                 |
| R-17 | **`headless-demo` 未声明 `@zeus-ui/headless` 依赖**                                             | 中     | 严格安装（非提升布局）会失败；迁移时暴露                                                   | `examples/headless-demo/src/main.tsx:1-2` vs `package.json`                                                                            | 迁移时补声明；这本身就说明 examples 未经独立安装验证                                              |
| R-18 | **四个空壳样例无任何门禁**                                                                      | 低     | 迁移时无法判断是否还有人用                                                                 | `vanilla`、`vite-react`、`vite-vue`、`vite-vue2`（`vite-vue2` 名实不符）                                                               | `retire` 前需用户确认                                                                             |
| R-19 | **`vite-vue2` 描述与依赖不符**                                                                  | 低     | 误导使用者                                                                                 | `package.json:6` 写 Vue 2，`:16` 依赖 `vue: ^3.5.38`                                                                                   | 修正描述或废弃                                                                                    |
| R-20 | **`netlify.toml` 已失效**                                                                       | 低     | 指向不存在的 `ci-docs` 与 `docs/.vitepress/dist`                                           | `zeus-ui/netlify.toml:2-4`                                                                                                             | 删除或改指 `apps/docs`                                                                            |
| R-21 | **`check:admin:615-618` 恒真断言 `/.*/`**                                                       | 低     | 弱化了 Progress 断言                                                                       | `scripts/check/check-admin.ts:615-618`                                                                                                 | 迁移前修掉，不要带过去                                                                            |
| R-22 | **沙箱 origin 四套方案并存**                                                                    | 低     | 拆仓后四套部署各配一套 CSP                                                                 | `04-workflow-deployment-map.md` §5                                                                                                     | ecosystem 统一为一套；安全边界已 fail-closed                                                      |
| R-23 | **部署凭据复用**：admin 用 playground 的 host/user/SSH 作 fallback                              | 低     | 拆仓后 secret 归属不清                                                                     | `admin-image.yml:494-496,504-505`                                                                                                      | Phase 1 定义每个仓库的 environment 与 secret 归属                                                 |
| R-24 | **`@zeus-js/output-*` 声明为运行时依赖**（30 个包）                                             | 低     | 发布物体积与 SBOM 组成可能不准确                                                           | 46 个 manifest 解析                                                                                                                    | 核验是否被 runtime import；如不是，改为 peer/dev                                                  |

---

## 风险按阶段的阻断关系

```
Phase 1（冻结清单）
  ├── R-01 必须先回答（0.2.0 是否发布）      ← 决定 Phase 4 能否开始
  ├── R-05 必须逐产品定归属（3 个部署）      ← 决定 migration manifest 的范围
  ├── R-13 必须澄清（beta 配对契约）
  └── R-10/R-11 必须定 scope 归属

Phase 2（zeus-ui 组件职责）
  └── R-08 决定 examples 是否搬（建议不搬）

Phase 4（Demo 迁移）
  ├── R-02 必须先发布 beta.35            ← 否则 vendor 无法去
  ├── R-03 必须先设计 framework 断言的新宿主
  ├── R-04 create-zeus 模板必须同批处理
  ├── R-06 demos-pages 必须整体决策
  └── R-07 部署验收的 import 必须先解耦

Phase 5（证据链）
  ├── R-14 SBOM 要新建
  └── R-15/R-16 体积与 revision 要补

Phase 6（Admin 切换）
  └── R-09 vendor 删除必须在此之后
```

## 最危险的单点

**R-03（framework 断言失去宿主）** 是最容易被忽略的。它不会让任何 CI 变红——
admin 迁走后，`check:admin` 一起走，`ci.yml:641-642` 的步骤消失，
**没有任何门禁会报告「Router 的集成验证没有了」**。这会静默发生。

设计包 `docs/06-acceptance-and-non-goals.md:26-31` 要求「`check:admin` 原有重要断言逐项映射」，
但映射表如果只到「这一组去哪」而不问「新宿主是否真的存在」，就会通过验收而实际丢失覆盖。

建议在 Phase 1 的 migration manifest 里为 R-03 单列一行：**framework 组的 30 条断言，
目标仓库 zeus，目标测试文件待新建，宿主待定**。在宿主确定前，Phase 4 不得开始。
