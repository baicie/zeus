//! 解析器模块

use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_diagnostics::OxcDiagnostic;
use oxc_parser::Parser as OxcParser;
use oxc_span::SourceType;

use zeus_compiler_common::{CompileError, CompileResult};

/// 从字节偏移计算行列号
fn offset_to_line_col(source: &str, offset: usize) -> (usize, usize) {
    let mut line = 1;
    let mut col = 1;
    let mut byte_count = 0;

    for ch in source.chars() {
        if byte_count >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
        byte_count += ch.len_utf8();
    }

    (line, col)
}

/// 使用 ariadne 库渲染包含行列号的详细错误消息
fn format_diagnostic_errors(errors: &[OxcDiagnostic], source: &str) -> String {
    let mut messages = Vec::new();

    for diag in errors {
        let error_code = diag.code.to_string();
        let code_part = if error_code.is_empty() {
            String::new()
        } else {
            format!("[{}] ", error_code)
        };

        // 尝试从 labels 中提取位置信息
        let location_info = if let Some(labels) = &diag.labels {
            let mut parts = Vec::new();
            for label in labels {
                let span = label.inner();
                let start = span.offset();
                let end = start + span.len();
                let (line, col) = offset_to_line_col(source, start);

                // 获取出错行的内容
                let line_idx = line.saturating_sub(1);
                let line_content = source.lines().nth(line_idx).unwrap_or("");

                // 获取标签描述
                let label_text = label.label().unwrap_or("");

                // 生成下划线标记
                let underline_len = (end - start).min(50).max(1);
                let underline = format!(
                    "{}{}",
                    " ".repeat((col - 1).max(0) as usize),
                    "^".repeat(underline_len)
                );

                if label_text.is_empty() {
                    parts.push(format!(
                        "  --> :{}:{}\n     | {}\n     | {}",
                        line, col, line_content, underline
                    ));
                } else {
                    parts.push(format!(
                        "  --> :{}:{}\n     | {}\n     | {}\n     = {}",
                        line, col, line_content, underline, label_text
                    ));
                }
            }
            parts.join("\n")
        } else {
            String::new()
        };

        if location_info.is_empty() {
            messages.push(format!("{}{}", code_part, diag.message));
        } else {
            messages.push(format!("{}{}\n{}", code_part, diag.message, location_info));
        }
    }

    messages.join("\n\n")
}

/// Parse JSX/TSX with an allocator based on source type
pub fn parse_with_allocator<'a>(
    allocator: &'a Allocator,
    source: &'a str,
    source_type: &str,
) -> CompileResult<Program<'a>> {
    let source_type = match source_type {
        "jsx" => SourceType::jsx(),
        "tsx" => SourceType::tsx(),
        "ts" => SourceType::ts(),
        "js" => SourceType::default(),
        _ => SourceType::jsx(),
    };

    let ret = OxcParser::new(allocator, source, source_type).parse();

    if !ret.errors.is_empty() {
        let error_msg = format_diagnostic_errors(&ret.errors, source);
        return Err(CompileError::parse(error_msg, 0, 0));
    }

    Ok(ret.program)
}

/// Parse TSX with an allocator
pub fn parse_tsx_with_allocator<'a>(
    allocator: &'a Allocator,
    source: &'a str,
) -> CompileResult<Program<'a>> {
    let ret = OxcParser::new(allocator, source, SourceType::tsx()).parse();

    if !ret.errors.is_empty() {
        let error_msg = format_diagnostic_errors(&ret.errors, source);
        return Err(CompileError::parse(error_msg, 0, 0));
    }

    Ok(ret.program)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_jsx() {
        let source = r#"
function App() {
  return <div>Hello</div>;
}
"#;
        let allocator = Allocator::default();
        let result = parse_with_allocator(&allocator, source, "jsx");
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_invalid() {
        let source = "function {";
        let allocator = Allocator::default();
        let result = parse_with_allocator(&allocator, source, "js");
        assert!(result.is_err());
        if let Err(e) = result {
            println!("Error message:\n{}", e.message);
        }
    }
}
