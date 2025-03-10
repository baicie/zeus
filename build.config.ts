import { defineConfig } from "tsup";
import { readdirSync } from "fs";
import { join } from "path";

// 获取所有包的名称
const packages = readdirSync(join(__dirname, "packages")).filter(
  (pkg) => pkg !== ".DS_Store"
);

// 构建配置
export default defineConfig({
  entry: Object.fromEntries(
    packages.map((pkg) => [
      // 为每个包创建入口，格式: pkg/index
      `${pkg}/index`,
      `packages/${pkg}/src/index.ts`,
    ])
  ),
  // 输出格式
  format: ["cjs", "esm"],
  // 生成类型声明
  dts: true,
  // 代码分割
  splitting: true,
  // 清理输出目录
  clean: true,
  // 不压缩
  minify: false,
  // 生成 sourcemap
  sourcemap: true,
  // 输出目录
  outDir: "packages",
  // 输出文件扩展名
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".mjs",
    };
  },
  // 配置每个包的输出目录
  esbuildOptions(options, context) {
    options.outbase = "packages";
  },
  // 配置输出结构
  treeshake: true,
  // 保持包名结构
  //   outNames: ({ pkgName }) => pkgName.split("/").pop() || pkgName,
});
