import { createDOMCompiler } from '@zeus-js/compiler'
import { transformSync } from '@babel/core'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const compiler = createDOMCompiler({
  moduleName: '@zeus-js/runtime',
})

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const _path = path.resolve(__dirname, './index.jsx')
const code = fs.readFileSync(_path, 'utf-8')

const result = transformSync(code, {
  filename: _path,
  presets: [],
  plugins: [compiler],
  parserOpts: {
    plugins: ['jsx'],
  },
  ast: false,
  sourceMaps: true,
  configFile: false,
  babelrc: false,
})

fs.writeFileSync(path.resolve(__dirname, './result.js'), result.code)
// fs.writeFileSync(
//   path.resolve(__dirname, './result.map'),
//   JSON.stringify(result.map ?? {}, null, 2),
// )
