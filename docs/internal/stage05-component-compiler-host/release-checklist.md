# Component Compiler Host Release Checklist

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
- [ ] `examples/icons-no-runtime` — `pnpm -F @zeus-js/example-icons-no-runtime build`

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
