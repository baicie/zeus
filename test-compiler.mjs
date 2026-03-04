import { compiler } from './packages/compiler-core/dist/index.mjs';

// 测试1: 正确的代码 - 应该成功
const code1 = `function Counter() {
  return <div>Hello</div>
}
`;

// 测试2: 缺少分号 - 但编译器可能不报错因为它只是解析
const code2 = `function Counter() {
  const x = 1
  return <div>Hello</div>
}
`;

// 测试3: TypeScript 语法错误 - 使用可选参数 (只有 tsx 解析器会报错)
const code3 = `function Counter(props?: CounterProps): Node {
  return <div>Hello</div>
}
`;

console.log('=== Test 1: Valid code ===');
const result1 = compiler(code1, { sourceType: 'tsx', experimental: false, target: 'es2020', minify: false });
console.log('Success:', result1.success);

console.log('\n=== Test 2: Missing semicolon ===');
const result2 = compiler(code2, { sourceType: 'tsx', experimental: false, target: 'es2020', minify: false });
console.log('Success:', result2.success);
console.log('Errors:', result2.errors);

console.log('\n=== Test 3: TypeScript syntax error ===');
const result3 = compiler(code3, { sourceType: 'tsx', experimental: false, target: 'es2020', minify: false });
console.log('Success:', result3.success);
console.log('Errors:', result3.errors);

console.log('\n=== Test 4: Another TS error ===');
const code4 = `const x: number = "hello";`;
const result4 = compiler(code4, { sourceType: 'ts', experimental: false, target: 'es2020', minify: false });
console.log('Success:', result4.success);
console.log('Errors:', result4.errors);
