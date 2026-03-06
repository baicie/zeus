//! Parser module for Zeus Compiler Core
//!
//! Provides parsing via oxc. Use `parse_source` to obtain a typed AST
//! that can be visited by downstream compiler crates.

use oxc::allocator::Allocator;
use oxc::diagnostics::OxcDiagnostic;
use oxc::parser::Parser;
use oxc::span::SourceType;

/// Parse source code into an oxc AST program.
///
/// Returns `Ok(program)` when there are no parse errors, or
/// `Err(diagnostics)` containing all reported errors otherwise.
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
