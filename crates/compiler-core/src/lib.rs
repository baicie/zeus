//! Zeus Compiler Core
//!
//! This crate provides the core parsing functionality for the Zeus framework,
//! built on top of the oxc parser. For JSX compilation, use `zeus-compiler-dom`.

pub mod parser;

use oxc::span::SourceType;

// Re-export common diagnostic types so downstream crates have a single import path
pub use zeus_compiler_common::{
    CompilerError, Diagnostic, DiagnosticReporter, Result, Severity,
};

/// Core compiler configuration
#[derive(Debug, Clone)]
pub struct CompilerOptions {
    /// Source type (JavaScript, TypeScript, JSX, etc.)
    pub source_type: SourceType,
    /// Enable experimental features
    pub experimental: bool,
}
