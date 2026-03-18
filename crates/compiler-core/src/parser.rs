//! 解析器模块

use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_parser::Parser as OxcParser;
use oxc_span::SourceType;

use zeus_compiler_common::{CompileError, CompileErrorType, CompileResult};

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

    if let Some(errors) = ret.errors.into_iter().next() {
        return Err(CompileError {
            error_type: CompileErrorType::Parse,
            message: format!("Parse error: {:?}", errors),
            code: Some(CompileErrorType::Parse.as_str().to_string()),
            start_offset: 0,
            end_offset: 0,
        });
    }

    Ok(ret.program)
}

/// Parse TSX with an allocator
pub fn parse_tsx_with_allocator<'a>(
    allocator: &'a Allocator,
    source: &'a str,
) -> CompileResult<Program<'a>> {
    let ret = OxcParser::new(allocator, source, SourceType::tsx()).parse();

    if let Some(errors) = ret.errors.into_iter().next() {
        return Err(CompileError {
            error_type: CompileErrorType::Parse,
            message: format!("Parse error: {:?}", errors),
            code: Some(CompileErrorType::Parse.as_str().to_string()),
            start_offset: 0,
            end_offset: 0,
        });
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
