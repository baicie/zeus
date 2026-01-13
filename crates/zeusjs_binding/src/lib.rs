use napi_derive::napi;
use zeus_compiler_core::{compile_source, CompileOptions};
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
    "js" => SourceType::unambiguous(),
    "jsx" => SourceType::jsx(),
    "ts" => SourceType::ts(),
    "tsx" => SourceType::tsx(),
    _ => SourceType::unambiguous(),
  };

  // 构建编译选项 / Build compile options
  let compile_options = CompileOptions {
    source_type,
    target: options.target.clone(),
    minify: options.minify,
    experimental: options.experimental,
  };

  // 调用编译器核心 / Call compiler core
  match compile_source(&source, &compile_options) {
    Ok(result) => CompilerResult {
      code: result.code,
      success: true,
      errors: vec![],
    },
    Err(error) => CompilerResult {
      code: "// Compilation failed".to_string(),
      success: false,
      errors: vec![format!("{}", error)],
    },
  }
}
