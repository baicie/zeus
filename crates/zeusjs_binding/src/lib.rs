use napi_derive::napi;
use zeus_compiler_dom::{DomCompiler, DomCompilerOptions};
use zeus_compiler_core::CompilerOptions as CoreCompilerOptions; // Rename to avoid conflict
use oxc::span::SourceType;

// 编译器选项 / Compiler options
#[napi(object)]
pub struct CompilerOptions {
  pub source_type: String,
  pub experimental: bool,
  pub target: String,
  pub minify: bool,
}

// 编译器结果 / Compiler result
#[napi(object)]
pub struct CompilerResult {
  pub code: String,
  pub success: bool,
  pub errors: Vec<String>,
}

// 编译函数 / Compiler function
#[napi]
pub fn compiler(source: String, options: CompilerOptions) -> CompilerResult {
  // 解析源代码类型 / Parse source type
  let source_type = match options.source_type.as_str() {
    "js" => SourceType::default(),
    "jsx" => SourceType::jsx(),
    "ts" => SourceType::ts(),
    "tsx" => SourceType::tsx(),
    _ => SourceType::default(),
  };

  // 使用 DomCompiler
  let dom_compiler = DomCompiler::new();
  
  // 检查是否需要 JSX 编译
  let is_jsx = source_type.is_jsx();

  let dom_options = DomCompilerOptions {
    base: CoreCompilerOptions {
      source_type,
      experimental: options.experimental,
    },
    jsx: is_jsx,
    jsx_pragma: None,
    jsx_pragma_frag: None,
    dom_optimizations: true,
    runtime_module: None,
  };

  match dom_compiler.compile_dom(&source, &dom_options) {
    Ok(code) => CompilerResult {
      code,
      success: true,
      errors: vec![],
    },
    Err(error) => CompilerResult {
      code: format!("// Compilation failed: {:?}", error),
      success: false,
      errors: vec![format!("{:?}", error)],
    },
  }
}
