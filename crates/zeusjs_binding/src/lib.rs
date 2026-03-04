use napi_derive::napi;
use zeus_compiler_dom::{DomCompiler, DomCompilerOptions};
use zeus_compiler_core::CompilerOptions as CoreCompilerOptions;
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
      let error_message = format_error(&error, &source);
      CompilerResult {
        code: format!("// Compilation failed\n// Error: {}", error_message),
        success: false,
        errors: vec![error_message],
      }
    }
  }
}

/// Format OxcDiagnostic with color, line/column, and code snippet
fn format_error(error: &oxc::diagnostics::OxcDiagnostic, source: &str) -> String {
  // Get the basic error message (includes location like "at line X, column Y")
  let error_str = error.to_string();
  
  // Extract position info from the diagnostic string manually
  let position = extract_position(&error_str);
  
  // Extract line number for code snippet
  let line_num = position
    .map(|(line, _col)| line)
    .unwrap_or(1);
  
  // Get the code snippet for this line
  let code_snippet = extract_line_snippet(source, line_num);
  
  // Build formatted error message
  if let Some(pos) = position {
    let location_str = format!("\x1b[34m--> \x1b[1m{}:{}\x1b[0m", pos.0, pos.1);
    let snippet_str = if let Some((line_content, _col)) = code_snippet {
      let indicator = format!("{}^", " ".repeat(pos.1.saturating_sub(1)));
      format!(
        "\n\x1b[37m {}\x1b[0m |\n\x1b[37m {}\x1b[0m | {}\n\x1b[37m {}\x1b[0m | \x1b[31m{}\x1b[0m",
        line_num,
        line_num,
        line_content.trim_end(),
        line_num,
        indicator
      )
    } else {
      String::new()
    };
    
    format!(
      "\n\x1b[31m\x1b[1merror\x1b[0m: {}{}{}\n",
      error_str,
      format!("\n{}", location_str),
      snippet_str
    )
  } else {
    // Use ANSI colors: red for error
    format!("\x1b[31m\x1b[1merror\x1b[0m: {}", error_str)
  }
}

/// Extract position (line, column) from error string manually
fn extract_position(error_str: &str) -> Option<(usize, usize)> {
  let s = error_str.to_lowercase();
  
  // Find "line" keyword
  if let Some(line_idx) = s.find("line") {
    let after_line = &s[line_idx + 4..];
    // Skip whitespace and find number
    let num_start = after_line.find(|c: char| c.is_ascii_digit())?;
    let num_end = num_start + after_line[num_start..].find(|c: char| !c.is_ascii_digit()).unwrap_or(after_line.len() - num_start);
    let line: usize = after_line[num_start..num_start + num_end].parse().ok()?;
    
    // Look for column after "column"
    if let Some(col_idx) = after_line[num_end..].find("column") {
      let after_col = &after_line[num_end + col_idx + 6..];
      let col_start = after_col.find(|c: char| c.is_ascii_digit())?;
      let col_end = col_start + after_col[col_start..].find(|c: char| !c.is_ascii_digit()).unwrap_or(after_col.len() - col_start);
      let col: usize = after_col[col_start..col_start + col_end].parse().ok()?;
      
      return Some((line, col));
    }
  }
  
  None
}

/// Extract a specific line from source code
fn extract_line_snippet(source: &str, line_num: usize) -> Option<(String, usize)> {
  let current_line = source.lines().nth(line_num - 1)?;
  Some((current_line.to_string(), 1))
}
