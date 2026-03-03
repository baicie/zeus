//! Zeus Compiler Core
//!
//! This crate provides the core compilation functionality for the Zeus framework.
//! It includes parsing, semantic analysis, code generation capabilities, and diagnostics
//! built on top of the oxc parser.
//!
//! This is a utility crate that provides common functionality for other compiler crates.
//! For JSX compilation, use `zeus-compiler-dom` instead.

pub mod parser;
pub mod semantic;
pub mod codegen;
pub mod diagnostics;

use oxc::span::SourceType;

/// Core compiler configuration
#[derive(Debug, Clone)]
pub struct CompilerOptions {
    /// Source type (JavaScript, TypeScript, JSX, etc.)
    pub source_type: SourceType,
    /// Enable experimental features
    pub experimental: bool,
}
