//! Code generation module for Zeus Compiler Core
//!
//! This module provides code generation functionality to convert
//! AST back to source code.

use oxc::allocator::Allocator;
use oxc::ast::ast::Program;
use oxc::codegen::CodegenOptions;

/// Code generation options
#[derive(Debug, Clone)]
pub struct CodegenConfig {
    /// Minify the output
    pub minify: bool,
    /// Target ECMAScript version
    pub target: String,
}

impl Default for CodegenConfig {
    fn default() -> Self {
        Self {
            minify: false,
            target: "es2020".to_string(),
        }
    }
}

/// Generate code from AST
pub fn generate_code(
    _allocator: &Allocator,
    program: &Program,
    config: &CodegenConfig,
) -> Result<String, oxc::diagnostics::OxcDiagnostic> {
    let options = CodegenOptions {
        minify: config.minify,
        ..Default::default()
    };

    let result = oxc::codegen::Codegen::new()
        .with_options(options)
        .build(program);

    // Codegen currently doesn't return errors in the result
    // TODO: Handle errors properly when oxc API changes
    Ok(result.code)
}

/// Generate formatted JavaScript code
pub fn generate_js(program: &Program) -> Result<String, oxc::diagnostics::OxcDiagnostic> {
    let allocator = Allocator::default();
    generate_code(&allocator, program, &CodegenConfig::default())
}

/// Generate minified JavaScript code
pub fn generate_minified_js(program: &Program) -> Result<String, oxc::diagnostics::OxcDiagnostic> {
    let allocator = Allocator::default();
    let config = CodegenConfig {
        minify: true,
        ..Default::default()
    };
    generate_code(&allocator, program, &config)
}
