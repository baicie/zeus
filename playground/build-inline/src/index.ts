import { compiler } from '@zeus-js/compiler-core'

// 示例2: 使用编译器
console.log('=== 编译器示例 ===')

// 定义要编译的源代码
const sourceCode = `
function greet(name) {
  return 'Hello, ' + name + '!';
}

console.log(greet('Zeus'));
`

// 定义编译选项
const compileOptions = {
  sourceType: 'js', // 源代码类型: js, jsx, ts, tsx
  experimental: false, // 是否启用实验性功能
  target: 'es2020', // 目标ECMAScript版本
  minify: false, // 是否压缩代码
}

// 调用编译器
try {
  const result = compiler(sourceCode, compileOptions)

  if (result.success) {
    console.log('✅ 编译成功!')
    console.log('编译后的代码:')
    console.log(result.code)
  } else {
    console.log('❌ 编译失败:')
    result.errors.forEach((error, index) => {
      console.log(`${index + 1}. ${error}`)
    })
  }
} catch (error) {
  console.error('编译器调用出错:', error)
}

// 示例3: 编译不同类型的代码
console.log('\n=== 不同代码类型示例 ===')

const examples = [
  {
    name: '简单函数',
    code: 'function add(a, b) { return a + b; }',
    options: {
      sourceType: 'js',
      experimental: false,
      target: 'es2020',
      minify: false,
    },
  },
  {
    name: 'TypeScript代码',
    code: 'const message: string = "Hello TypeScript!"; console.log(message);',
    options: {
      sourceType: 'ts',
      experimental: false,
      target: 'es2020',
      minify: false,
    },
  },
  {
    name: 'JSX代码',
    code: 'const element = <div>Hello JSX!</div>;',
    options: {
      sourceType: 'jsx',
      experimental: false,
      target: 'es2020',
      minify: false,
    },
  },
]

examples.forEach((example, index) => {
  console.log(`\n${index + 1}. ${example.name}:`)
  try {
    const result = compiler(example.code, example.options)
    if (result.success) {
      console.log('✅ 编译成功')
      // 只显示前100个字符，避免输出过长
      const preview =
        result.code.length > 100
          ? result.code.substring(0, 100) + '...'
          : result.code
      console.log('预览:', preview)
    } else {
      console.log('❌ 编译失败:', result.errors.join(', '))
    }
  } catch (error) {
    console.log('❌ 错误:', (error as Error).message)
  }
})

// 示例4: 错误处理示例
console.log('\n=== 错误处理示例 ===')

const invalidCode = 'function broken { console.log("missing parens"); }'
try {
  const result = compiler(invalidCode, {
    sourceType: 'js',
    experimental: false,
    target: 'es2020',
    minify: false,
  })

  if (!result.success) {
    console.log('如预期般捕获到语法错误:')
    result.errors.forEach(error => console.log('  -', error))
  }
} catch (error) {
  console.error('未预期的错误:', error)
}

console.log('\n🎉 Zeus编译器示例完成!')
