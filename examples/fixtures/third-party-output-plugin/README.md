# Third-party Output Plugin

This package lives outside the pnpm workspace and demonstrates the public
`@zeus-js/bundler-plugin` `apiVersion: 1` contract.

It registers the namespaced output kind `acme:json` and emits one JSON asset per
discovered custom element. It imports no private Zeus source path, so Rollup,
Vite, or Rolldown can load the package as an ordinary ESM dependency.

```js
import acmeJsonOutput from './index.js'

zeus({
  components: { include: ['src/components/**/*.tsx'] },
  plugins: [acmeJsonOutput()],
})
```

Output plugins run with the full privileges of the application build. They are
not sandboxed. Pin and review third-party packages just as you would any other
Node.js build dependency.
