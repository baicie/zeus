# Simple Node.js + TypeScript 项目

这是一个简单的 Node.js + TypeScript 项目模板，适合快速开始新的项目。

## 项目结构

```
simple-node-ts/
├── src/
│   └── index.ts          # 主入口文件
├── dist/                 # 编译输出目录
├── package.json          # 项目配置
├── tsconfig.json         # TypeScript 配置
├── rolldown.config.ts    # Rolldown 打包配置
└── README.md             # 项目说明
```

## 安装依赖

```bash
npm install
# 或者使用 pnpm
pnpm install
```

## 可用脚本

- `npm run dev` - 开发模式运行（使用 tsx）
- `npm run watch` - 监听模式运行（文件变化时自动重启）
- `npm run build` - 使用 rolldown 打包项目
- `npm run build:tsc` - 使用 TypeScript 编译器编译
- `npm run start` - 运行编译后的代码
- `npm run clean` - 清理编译输出目录

## 开发

1. 运行开发模式：

   ```bash
   npm run dev
   ```

2. 或者使用监听模式：
   ```bash
   npm run watch
   ```

## 构建和运行

1. 使用 rolldown 打包项目：

   ```bash
   npm run build
   ```

2. 或者使用 TypeScript 编译器：

   ```bash
   npm run build:tsc
   ```

3. 运行编译后的代码：
   ```bash
   npm run start
   ```

## 特性

- ✅ TypeScript 支持
- ✅ Rolldown 打包工具
- ✅ 开发时热重载
- ✅ 类型检查
- ✅ 源码映射
- ✅ 声明文件生成
- ✅ 简单的示例代码

## 开始使用

编辑 `src/index.ts` 文件开始您的开发！
