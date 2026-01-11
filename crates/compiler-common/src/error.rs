//! Common error types used across compiler crates

use oxc::diagnostics::OxcDiagnostic;
use serde::{Deserialize, Serialize};
use std::fmt;
use thiserror::Error;

/// Main compiler error type
#[derive(Debug, Error, Serialize, Deserialize)]
pub enum CompilerError {
    /// OXC parser/semantic error
    #[error("OXC error: {0}")]
    Oxc(String),

    /// I/O error
    #[error("IO error: {0}")]
    Io(String),

    /// Configuration error
    #[error("Configuration error: {0}")]
    Config(String),

    /// Compilation error
    #[error("Compilation error: {0}")]
    Compilation(String),

    /// Unsupported feature error
    #[error("Unsupported feature: {0}")]
    Unsupported(String),

    /// Generic error
    #[error("{0}")]
    Other(String),
}

impl CompilerError {
    /// Create a new OXC error
    pub fn oxc(error: &OxcDiagnostic) -> Self {
        Self::Oxc(error.to_string())
    }

    /// Create a new I/O error
    pub fn io(error: impl fmt::Display) -> Self {
        Self::Io(error.to_string())
    }

    /// Create a new configuration error
    pub fn config(message: impl Into<String>) -> Self {
        Self::Config(message.into())
    }

    /// Create a new compilation error
    pub fn compilation(message: impl Into<String>) -> Self {
        Self::Compilation(message.into())
    }

    /// Create a new unsupported feature error
    pub fn unsupported(feature: impl Into<String>) -> Self {
        Self::Unsupported(feature.into())
    }

    /// Create a generic error
    pub fn other(message: impl Into<String>) -> Self {
        Self::Other(message.into())
    }

    /// Get the error severity
    pub fn severity(&self) -> super::config::Severity {
        match self {
            Self::Oxc(_) | Self::Io(_) | Self::Compilation(_) => super::config::Severity::Error,
            Self::Config(_) | Self::Unsupported(_) => super::config::Severity::Warning,
            Self::Other(_) => super::config::Severity::Info,
        }
    }
}

impl From<OxcDiagnostic> for CompilerError {
    fn from(error: OxcDiagnostic) -> Self {
        Self::oxc(&error)
    }
}

impl From<std::io::Error> for CompilerError {
    fn from(error: std::io::Error) -> Self {
        Self::io(error)
    }
}

impl From<anyhow::Error> for CompilerError {
    fn from(error: anyhow::Error) -> Self {
        Self::other(error.to_string())
    }
}

/// Result type alias for compiler operations
pub type Result<T> = std::result::Result<T, CompilerError>;

/// Diagnostic reporter for collecting multiple errors
#[derive(Debug, Default)]
pub struct DiagnosticReporter {
    diagnostics: Vec<super::config::Diagnostic>,
}

impl DiagnosticReporter {
    /// Create a new diagnostic reporter
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a diagnostic
    pub fn add(&mut self, diagnostic: super::config::Diagnostic) {
        self.diagnostics.push(diagnostic);
    }

    /// Add a compiler error
    pub fn add_error(&mut self, error: CompilerError) {
        let diagnostic = super::config::Diagnostic::error(error.to_string())
            .with_file("compiler"); // TODO: Add proper file info
        self.add(diagnostic);
    }

    /// Add an OXC error
    pub fn add_oxc_error(&mut self, error: &OxcDiagnostic) {
        let diagnostic = super::config::Diagnostic::error(error.to_string());
        self.add(diagnostic);
    }

    /// Get all diagnostics
    pub fn diagnostics(&self) -> &[super::config::Diagnostic] {
        &self.diagnostics
    }

    /// Check if there are any errors
    pub fn has_errors(&self) -> bool {
        self.diagnostics.iter().any(|d| d.severity == super::config::Severity::Error)
    }

    /// Check if there are any warnings
    pub fn has_warnings(&self) -> bool {
        self.diagnostics.iter().any(|d| d.severity == super::config::Severity::Warning)
    }

    /// Clear all diagnostics
    pub fn clear(&mut self) {
        self.diagnostics.clear();
    }

    /// Get error count
    pub fn error_count(&self) -> usize {
        self.diagnostics.iter().filter(|d| d.severity == super::config::Severity::Error).count()
    }

    /// Get warning count
    pub fn warning_count(&self) -> usize {
        self.diagnostics.iter().filter(|d| d.severity == super::config::Severity::Warning).count()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compiler_error_creation() {
        use crate::Severity;

        let error = CompilerError::compilation("Test error");
        assert_eq!(error.severity(), Severity::Error);
        assert!(error.to_string().contains("Test error"));
    }

    #[test]
    fn test_diagnostic_reporter() {
        let mut reporter = DiagnosticReporter::new();
        reporter.add_error(CompilerError::compilation("Test error"));

        assert!(reporter.has_errors());
        assert_eq!(reporter.error_count(), 1);
        assert_eq!(reporter.warning_count(), 0);
    }
}
