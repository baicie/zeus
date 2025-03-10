import { resolve } from "path";
import { readFileSync } from "fs";
import { defineConfig } from "tsup";
import replace from "@rollup/plugin-replace";
import json from "@rollup/plugin-json";

if (!process.env.TARGET) {
  throw new Error("TARGET package must be specified via --environment flag.");
}

const packagesDir = resolve("packages");
const packageDir = resolve(packagesDir, process.env.TARGET);

// 读取目标包的 package.json
const pkg = JSON.parse(
  readFileSync(resolve(packageDir, "package.json"), "utf-8")
);

const name = pkg.name.split("/")[1];

// 构建配置
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  minify: process.env.NODE_ENV === "production",
  sourcemap: true,
  outDir: resolve(packageDir, "dist"),
  // 确保输出文件使用正确的扩展名
  outExtension({ format }) {
    return {
      js: format === "cjs" ? ".cjs" : ".mjs",
    };
  },
  // 注入环境变量
  esbuildOptions(options) {
    options.define = {
      __VERSION__: `"${pkg.version}"`,
      __DEV__: `process.env.NODE_ENV !== "production"`,
    };
  },
  // 插件配置
  plugins: [
    json(),
    replace({
      preventAssignment: true,
      values: {
        __VERSION__: pkg.version,
        __DEV__: process.env.NODE_ENV !== "production",
      },
    }),
  ],
});
