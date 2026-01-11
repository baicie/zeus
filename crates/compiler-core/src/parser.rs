//! Parser module for Zeus Compiler Core
//!
//! This module provides parsing functionality using oxc parser.

use oxc::allocator::Allocator;
use oxc::diagnostics::OxcDiagnostic;
use oxc::parser::Parser;
use oxc::span::SourceType;

/// Parse source code into AST
pub fn parse_source<'a>(
    allocator: &'a Allocator,
    source: &'a str,
    source_type: SourceType,
) -> Result<oxc::ast::ast::Program<'a>, Vec<OxcDiagnostic>> {
    let parser = Parser::new(allocator, source, source_type);
    let result = parser.parse();

    if result.errors.is_empty() {
        Ok(result.program)
    } else {
        Err(result.errors)
    }
}

/// Parse JavaScript/TypeScript source code with default settings
pub fn parse_js(source: &str) -> Result<String, Vec<OxcDiagnostic>> {
    let allocator = Allocator::default();
    let result = parse_source(&allocator, source, SourceType::default())?;
    // Convert AST to string representation for now
    Ok(format!("{:?}", result))
}

/// Parse JSX source code
pub fn parse_jsx(source: &str) -> Result<String, Vec<OxcDiagnostic>> {
    let allocator = Allocator::default();
    let result = parse_source(&allocator, source, SourceType::jsx())?;
    Ok(format!("{:?}", result))
}

/// Parse TypeScript source code
pub fn parse_typescript(source: &str) -> Result<String, Vec<OxcDiagnostic>> {
    let allocator = Allocator::default();
    let result = parse_source(&allocator, source, SourceType::ts())?;
    Ok(format!("{:?}", result))
}
