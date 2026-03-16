//! 解析器模块

use oxc_allocator::Allocator;
use oxc_ast::ast::Program;
use oxc_parser::Parser as OxcParser;
use oxc_span::SourceType;

use zeus_compiler_common::{CompileError, CompileErrorType, CompileResult};

/// Parse JSX with an allocator
/// 
/// The caller must ensure the allocator lives as long as the returned program.
/// 
/// # Example
/// ```ignore
/// let allocator = Allocator::default();
/// let program = parse_with_allocator(&allocator, source).unwrap();
/// // Use program while allocator is in scope
/// ```
pub fn parse_with_allocator<'a>(
    allocator: &'a Allocator,
    source: &'a str,
) -> CompileResult<Program<'a>> {
    let ret = OxcParser::new(allocator, source, SourceType::jsx()).parse();

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
        let result = parse_with_allocator(&allocator, source);
        assert!(result.is_ok());
    }

    #[test]
    fn test_parse_invalid() {
        let source = "function {";
        let allocator = Allocator::default();
        let result = parse_with_allocator(&allocator, source);
        assert!(result.is_err());
    }
}
