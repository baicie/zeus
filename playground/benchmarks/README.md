# Framework Performance Benchmarks

这个基准测试套件用于比较 Vue 3、React 18 和 Svelte 框架的性能表现。

## 测试内容

### 框架对比

- **Vue 3**: 最新的 Vue.js 框架
- **React 18**: 最新的 React 框架
- **Svelte**: 编译时优化的框架

### 测试场景

1. **组件挂载 (Mount)**: 测试组件创建和挂载的性能
2. **组件更新 (Update)**: 测试状态更新和重新渲染的性能
3. **列表渲染 (List)**: 测试大量数据渲染的性能

## 运行基准测试

```bash
# 安装依赖
pnpm install

# 运行基准测试
pnpm test

# 或者使用 vitest 直接运行
npx vitest run
```

## 输出格式

基准测试结果会直接输出到终端，使用 Vitest 的默认格式，便于在 CI 环境中查看。

### 示例输出

```
Vue 3 Mount: 0.12ms avg, 0.15ms p95
React 18 Mount: 0.08ms avg, 0.10ms p95
Svelte Mount: 0.05ms avg, 0.07ms p95

📊 Mount Performance Comparison:
vue3: 0.12ms
react18: 0.08ms
svelte: 0.05ms

🏆 Performance Summary Report
================================

📊 By Framework:
vue3: 0.15ms average
react18: 0.12ms average
svelte: 0.08ms average

📈 By Scenario:
mount: 0.08ms average
update: 0.05ms average
list: 0.25ms average
```

## 测试配置

- **挂载测试**: 100 次迭代
- **更新测试**: 1000 次迭代
- **列表测试**: 50 次迭代（1000 个元素）

## 性能指标

- **平均时间 (avg)**: 所有迭代的平均执行时间
- **P95**: 95% 的迭代执行时间
- **P99**: 99% 的迭代执行时间
- **最小时间 (min)**: 最快的一次执行
- **最大时间 (max)**: 最慢的一次执行

## 注意事项

1. 这些测试是模拟的基准测试，实际性能可能因环境而异
2. 测试结果主要用于相对性能比较，而非绝对性能测量
3. 在 CI 环境中运行时，建议多次运行以获得更稳定的结果
