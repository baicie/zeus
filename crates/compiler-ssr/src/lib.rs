//! Zeus SSR 编译器模块
//!
//! 实现服务端渲染编译

mod hydration;

pub use hydration::{HydrationAnalyzer, HydrationInfo, HydrationMarker, MarkerType};

use zeus_compiler_common::CompilerOptions;

/// SSR 编译器选项
#[derive(Debug, Clone)]
pub struct SsrOptions {
    /// 是否启用流式渲染
    pub streaming: bool,
    /// 是否生成 hydration 代码
    pub hydration: bool,
    /// 是否启用异步数据获取
    pub async_data: bool,
    /// 是否压缩 HTML
    pub minify: bool,
    /// 服务端渲染的目标环境
    pub target: SsrTarget,
}

impl Default for SsrOptions {
    fn default() -> Self {
        Self {
            streaming: false,
            hydration: true,
            async_data: true,
            minify: false,
            target: SsrTarget::Node,
        }
    }
}

/// SSR 目标环境
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SsrTarget {
    /// Node.js 环境
    Node,
    /// Edge 环境（如 Cloudflare Workers）
    Edge,
    /// Bun 环境
    Bun,
}

/// SSR 编译器状态
pub struct SsrCompilerState {
    /// 收集的 HTML 片段
    pub html_fragments: Vec<HtmlFragment>,
    /// 是否在 SSR 模式
    pub is_ssr: bool,
    /// 异步数据获取列表
    pub async_data_fetches: Vec<AsyncDataFetch>,
}

impl SsrCompilerState {
    pub fn new() -> Self {
        Self {
            html_fragments: Vec::new(),
            is_ssr: true,
            async_data_fetches: Vec::new(),
        }
    }
}

impl Default for SsrCompilerState {
    fn default() -> Self {
        Self::new()
    }
}

/// HTML 片段
#[derive(Debug, Clone)]
pub struct HtmlFragment {
    /// 片段名称
    pub name: String,
    /// HTML 内容
    pub html: String,
    /// 动态占位符
    pub placeholders: Vec<Placeholder>,
}

/// 占位符
#[derive(Debug, Clone)]
pub struct Placeholder {
    /// 占位符索引
    pub index: usize,
    /// 表达式源码
    pub expression: String,
    /// 是否为 HTML 转义
    pub escape_html: bool,
}

/// 异步数据获取
#[derive(Debug, Clone)]
pub struct AsyncDataFetch {
    /// 获取函数名称
    pub name: String,
    /// 数据键名
    pub key: String,
    /// 数据源表达式
    pub source: String,
}

/// SSR 编译器
#[allow(dead_code)]
pub struct SsrCompiler {
    options: CompilerOptions,
    ssr_options: SsrOptions,
}

impl SsrCompiler {
    pub fn new() -> Self {
        Self {
            options: CompilerOptions::default(),
            ssr_options: SsrOptions::default(),
        }
    }

    pub fn with_options(options: CompilerOptions) -> Self {
        Self {
            options,
            ssr_options: SsrOptions::default(),
        }
    }

    pub fn with_ssr_options(ssr_options: SsrOptions) -> Self {
        Self {
            options: CompilerOptions::default(),
            ssr_options,
        }
    }

    /// 编译为 SSR 代码
    pub fn compile(&self, source: &str) -> Result<String, String> {
        if self.ssr_options.streaming {
            return self.compile_streaming(source);
        }

        let mut code = String::new();
        code.push_str("// SSR compiled\n");

        // 导入 SSR runtime
        code.push_str("import { renderToString } from '@zeus-js/server-renderer';\n");

        if self.ssr_options.async_data {
            code.push_str("import { useAsyncData } from '@zeus-js/server-renderer';\n");
        }

        code.push_str("\n");
        code.push_str("export function render(props) {\n");
        code.push_str(&format!("  return renderToString({});\n", source));
        code.push_str("}\n");

        // 生成 hydration 代码
        if self.ssr_options.hydration {
            code.push_str("\n");
            code.push_str(&self.generate_hydration_code("/* html */"));
        }

        Ok(code)
    }

    /// 编译为流式 SSR 代码
    pub fn compile_streaming(&self, source: &str) -> Result<String, String> {
        let mut code = String::new();
        code.push_str("// Streaming SSR compiled\n");

        // 导入流式渲染 runtime
        code.push_str("import { renderToPipeableStream } from '@zeus-js/server-renderer';\n");

        code.push_str("\n");
        code.push_str("export function createStream(props) {\n");
        code.push_str("  return renderToPipeableStream(");
        code.push_str(source);
        code.push_str(", {\n");
        code.push_str("    onShellReady() {\n");
        code.push_str("      // Shell 准备好了\n");
        code.push_str("    },\n");
        code.push_str("    onShellError(error) {\n");
        code.push_str("      console.error('Shell error:', error);\n");
        code.push_str("    },\n");
        code.push_str("    onAllReady() {\n");
        code.push_str("      // 所有内容准备好了\n");
        code.push_str("    },\n");
        code.push_str("    onError(error) {\n");
        code.push_str("      console.error('Render error:', error);\n");
        code.push_str("    }\n");
        code.push_str("  });\n");
        code.push_str("}\n");

        Ok(code)
    }

    /// 编译为流式 SSR（使用 Web Streams API）
    pub fn compile_web_streaming(&self, source: &str) -> Result<String, String> {
        let mut code = String::new();
        code.push_str("// Web Streaming SSR compiled\n");

        code.push_str("import { renderToWebStream } from '@zeus-js/server-renderer';\n");

        code.push_str("\n");
        code.push_str("export async function renderAsync(props) {\n");
        code.push_str("  const encoder = new TextEncoder();\n");
        code.push_str("  const stream = new ReadableStream({\n");
        code.push_str("    start(controller) {\n");
        code.push_str("      renderToWebStream(");
        code.push_str(source);
        code.push_str(", {\n");
        code.push_str("        append(chunk) {\n");
        code.push_str("          controller.enqueue(encoder.encode(chunk));\n");
        code.push_str("        },\n");
        code.push_str("        error(err) {\n");
        code.push_str("          controller.error(err);\n");
        code.push_str("        }\n");
        code.push_str("      });\n");
        code.push_str("    }\n");
        code.push_str("  });\n");
        code.push_str("  return stream;\n");
        code.push_str("}\n");

        Ok(code)
    }

    /// 生成 hydration 代码
    pub fn generate_hydration_code(&self, html: &str) -> String {
        format!(
            r#"// Hydration code
import {{ hydrate }} from '@zeus-js/server-renderer';

export function hydrateApp(container, props) {{
  const html = `{}`;
  return hydrate(container, html, props);
}}
"#,
            html.replace('`', "\\`")
        )
    }

    /// 生成数据预取代码
    pub fn generate_data_prefetch(&self, data_fetches: &[AsyncDataFetch]) -> String {
        let mut code = String::new();
        code.push_str("// Data prefetch code\n");
        code.push_str("export function prefetchData(props) {\n");
        code.push_str("  return Promise.all([\n");

        for fetch in data_fetches {
            code.push_str(&format!(
                "    {}(props),\n",
                fetch.source
            ));
        }

        code.push_str("  ]);\n");
        code.push_str("}\n");
        code
    }
}

impl Default for SsrCompiler {
    fn default() -> Self {
        Self::new()
    }
}

/// 编译 JSX 源代码为 SSR
pub fn compile(source: &str) -> Result<String, String> {
    let compiler = SsrCompiler::new();
    compiler.compile(source)
}

/// 编译为流式 SSR
pub fn compile_streaming(source: &str) -> Result<String, String> {
    let compiler = SsrCompiler::new();
    compiler.compile_streaming(source)
}

/// 编译为 Web 流式 SSR
pub fn compile_web_streaming(source: &str) -> Result<String, String> {
    let compiler = SsrCompiler::new();
    compiler.compile_web_streaming(source)
}

/// SSR 编译函数 - 使用已有的编译框架进行简化处理
pub fn compile_with_options(source: &str, options: SsrOptions) -> Result<String, String> {
    let compiler = SsrCompiler::with_ssr_options(options);
    compiler.compile(source)
}
