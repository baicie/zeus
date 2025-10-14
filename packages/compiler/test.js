/**
 * 简单的编译器测试
 */

const { createDOMCompiler } = require('./dist/index.js')
const { transformSync } = require('@babel/core')

// 测试代码
const testCode = `
import React from 'react';

function App() {
  const name = 'Zeus';
  const isVisible = true;
  
  return (
    <div className={isVisible ? 'visible' : 'hidden'}>
      <h1>Hello {name}!</h1>
      <button onClick={() => console.log('clicked')}>
        Click me
      </button>
    </div>
  );
}

export default App;
`

// 创建编译器
const compiler = createDOMCompiler({
  moduleName: '@zeus-js/runtime-dom',
  optimizeTemplates: true,
})

// 转换代码
const result = transformSync(testCode, {
  filename: 'test.jsx',
  presets: [],
  plugins: [compiler],
  parserOpts: {
    plugins: ['jsx', 'typescript'],
  },
  ast: false,
  sourceMaps: true,
  configFile: false,
  babelrc: false,
})

console.log('转换结果:')
console.log(result.code)
console.log('\nSource Map:')
console.log(result.map)
