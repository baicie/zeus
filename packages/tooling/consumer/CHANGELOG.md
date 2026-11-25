# @zeus-js/devtools-consumer

## 0.1.1-beta.15

### Minor Changes

- Publish the DevTools consumer, which had no release path at all.

  The package was `private: true`, absent from the fixed release group, absent
  from `standalonePublish`'s set and absent from `devtools-release.yml`'s tag
  triggers — four separate gates, and no tag could have published it. An app
  could not carry its DevTools panel across a migration that may only install
  published packages.

  It also needed a shape, not just a flag: no `main`, no `exports`, no `types`,
  no `buildOptions`, so `getBuildablePackages()` would have skipped it even
  after the flag changed.

  CommonJS consumers get a `.d.cts`; without one TypeScript resolves the
  declaration as ESM and refuses the import with TS1479.
