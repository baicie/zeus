//! Semantic analysis module for Zeus Compiler Core
//!
//! This module provides semantic analysis functionality including
//! scope analysis, type checking, and symbol resolution.

use oxc::allocator::Allocator;
use oxc::ast::ast::Program;
use oxc::semantic::{Semantic, SemanticBuilder};
use oxc::span::SourceType;

/// Semantic analysis result
pub struct SemanticAnalysis<'a> {
    /// The semantic information
    pub semantic: Semantic<'a>,
    /// Any errors encountered during analysis
    pub errors: Vec<oxc::diagnostics::OxcDiagnostic>,
}

/// Perform semantic analysis on a parsed program
pub fn analyze_semantic<'a>(
    _allocator: &'a Allocator,
    program: &'a Program<'a>,
    _source_type: SourceType,
) -> SemanticAnalysis<'a> {
    let semantic_builder = SemanticBuilder::new()
        .build(program);

    SemanticAnalysis {
        semantic: semantic_builder.semantic,
        errors: semantic_builder.errors.into_iter().collect(),
    }
}

/// Check if semantic analysis passed without errors
pub fn semantic_check_passed(analysis: &SemanticAnalysis) -> bool {
    analysis.errors.is_empty()
}

/// Get semantic information summary
pub fn get_semantic_info(analysis: &SemanticAnalysis) -> String {
    format!("Semantic analysis completed with {} errors", analysis.errors.len())
}
