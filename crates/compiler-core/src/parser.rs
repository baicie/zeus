//! 解析器模块

use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_diagnostics::OxcDiagnostic;
use oxc_parser::Parser as OxcParser;
use oxc_span::SourceType;

use zeus_compiler_common::{CompileError, CompileResult};

/// 从 OxcDiagnostic Vec 提取简洁的错误消息
fn format_diagnostic_errors(errors: &[OxcDiagnostic]) -> String {
    errors
        .iter()
        .map(|diag| {
            // 使用 Display trait 获取简洁的错误消息
            diag.to_string()
        })
        .collect::<Vec<_>>()
        .join("\n")
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
        let error_msg = format_diagnostic_errors(&ret.errors);
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
        let error_msg = format_diagnostic_errors(&ret.errors);
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
    }
}
