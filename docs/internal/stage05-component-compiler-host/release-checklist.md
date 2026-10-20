# Component Compiler Host Release Checklist（历史模板）

> 本页保留为 Phase 10/11 的历史核对模板，不作为当前发布状态的判定来源。
> 当前证据以 `docs/internal/architecture-roadmap-2026-10.md` 和
> `docs/internal/roadmap-completion-audit-2026-10-19.md` 为准；真实 registry
> 发布后的 Golden、provenance 和消费者矩阵仍属于 B-003/E-009。

## Build

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm build`
- [ ] `pnpm build-dts`
- [ ] `pnpm check`
- [ ] `pnpm test-unit`

## Packages

Verify each package builds and exports are valid:

- [ ] `@zeus-js/component-analyzer`
- [ ] `@zeus-js/component-dts`
- [ ] `@zeus-js/bundler-plugin`
- [ ] `@zeus-js/output-wc`
- [ ] `@zeus-js/output-react-wrapper`
- [ ] `@zeus-js/output-vue-wrapper`
- [ ] `@zeus-js/output-icons`
- [ ] `@zeus-ui/headless`
- [ ] `@zeus-ui/registry`
- [ ] `zeus-ui`

## Exports

- [ ] `pnpm check:exports` passes
- [ ] Package exports point to existing files
- [ ] Package types point to existing files
- [ ] `sideEffects` config checked

## Examples

- [ ] `examples/web-component` — `pnpm -F @zeus-js/example-web-component build`
- [ ] `examples/react-wrapper` — `pnpm -F @zeus-js/example-react-wrapper build`
- [ ] `examples/vue-wrapper` — `pnpm -F @zeus-js/example-vue-wrapper build`
- [ ] `examples/registry-react` — `pnpm -F @zeus-js/example-registry-react build`
- [ ] `examples/registry-vue` — `pnpm -F @zeus-js/example-registry-vue build`

## CLI

- [ ] `zeus-ui init` works
- [ ] `zeus-ui add button` works
- [ ] Generated React component typechecks
- [ ] Generated Vue component typechecks

## Benchmark

- [ ] `pnpm bench:component-host` generates report
- [ ] Size baseline reviewed (`temp/bench/component-host/report.md`)
- [ ] Compile baseline reviewed
- [ ] Runtime baseline reviewed

## Docs

- [ ] `pnpm docs:build` passes
- [ ] Quick Start
- [ ] Web Component usage guide
- [ ] React usage guide
- [ ] Vue usage guide
- [ ] Registry usage guide
- [ ] Icons usage guide
- [ ] Component Compiler Host architecture docs
- [ ] Component API reference pages
- [ ] Release notes generated (`pnpm release:rc-notes`)
