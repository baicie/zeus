//! Zeus Compiler Core
//!
//! This crate provides the core compilation functionality for the Zeus framework.
//! It includes parsing, semantic analysis, and code generation capabilities
//! built on top of the oxc parser.

pub mod parser;
pub mod semantic;
pub mod codegen;
pub mod diagnostics;

use oxc::allocator::Allocator;
use oxc::diagnostics::OxcDiagnostic;
use oxc::parser::Parser;
use oxc::span::SourceType;

/// Core compiler configuration
#[derive(Debug, Clone)]
pub struct CompilerOptions {
    /// Source type (JavaScript, TypeScript, JSX, etc.)
    pub source_type: SourceType,
    /// Enable experimental features
    pub experimental: bool,
}

/// The main compiler struct
pub struct Compiler {
    allocator: Allocator,
}

impl Compiler {
    /// Create a new compiler instance
    pub fn new() -> Self {
        Self {
            allocator: Allocator::default(),
        }
    }

    /// Parse source code and return the AST
    pub fn parse(&self, source: &str, options: &CompilerOptions) -> Result<String, OxcDiagnostic> {
        let parser = Parser::new(&self.allocator, source, options.source_type);
        let result = parser.parse();

        if result.errors.is_empty() {
            // For now, return a string representation since we can't return the AST with proper lifetimes
            Ok(format!("{:?}", result.program))
        } else {
            Err(result.errors.into_iter().next().unwrap())
        }
    }

    /// Compile source code to target output
    pub fn compile(&self, source: &str, options: &CompilerOptions) -> Result<String, OxcDiagnostic> {
        let _ast_string = self.parse(source, options)?;
        // TODO: Implement code generation
        Ok("/* Compiled output */".to_string())
    }
}

impl Default for Compiler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compiler_creation() {
        let _compiler = Compiler::new();
        assert!(true); // Basic smoke test
    }

    #[test]
    fn test_parse_simple_code() {
        let compiler = Compiler::new();
        let options = CompilerOptions {
            source_type: SourceType::default(),
            experimental: false,
        };

        let result = compiler.parse("console.log('hello');", &options);
        assert!(result.is_ok());
    }
}
