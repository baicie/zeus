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
    Err(error) => {
      // Format error with friendly message and location info
      let error_message = format_error(&error);
      CompilerResult {
        code: format!("// Compilation failed\n// Error: {}", error_message),
        success: false,
        errors: vec![error_message],
      }
    }
  }
}

/// Format OxcDiagnostic with friendly message and location info
fn format_error(error: &oxc::diagnostics::OxcDiagnostic) -> String {
  // OxcDiagnostic provides its own formatted output via to_string()
  // But we can also extract some details from it
  let error_str = error.to_string();
  
  // Try to extract line/column info if present in the error message
  // OxcDiagnostic format is typically: "message (at line X, column Y)"
  if error_str.contains("at") || error_str.contains("line") {
    format!("Compilation error: {}", error_str)
  } else {
    format!("Compilation error: {}", error_str)
  }
}
