import type { Plugin } from 'rollup'
import type { ComponentMeta, OutputOptions } from './index'
import { generateReact } from './generators/react'
import { generateVue } from './generators/vue'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

export function outputPlugin(options: OutputOptions): Plugin {
  let components: ComponentMeta[] = []

  return {
    name: 'zeus-output',

    buildStart() {
      // 读取组件信息
      try {
        const json = require('./components.json')
        components = json
      } catch (e) {
        console.warn('No components.json found')
      }
    },

    // 生成框架特定代码
    async generateBundle() {
      for (const target of options.targets) {
        let code = ''
        switch (target.type) {
          case 'react':
            code = generateReact(components, target)
            break
          case 'vue':
            code = generateVue(components, target)
            break
        }

        this.emitFile({
          type: 'asset',
          fileName: target.proxiesFile || `${target.type}/index.js`,
          source: code,
        })
      }
    },
  }
}
