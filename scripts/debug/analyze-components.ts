import { analyzeComponents } from '@zeus-js/component-analyzer'

const result = await analyzeComponents({
  root: process.cwd(),
  include: ['examples/web-component/src/components/**/*.{ts,tsx}'],
})

console.log(JSON.stringify(result.manifest, null, 2))

if (result.diagnostics.length) {
  console.error(result.diagnostics)
}
