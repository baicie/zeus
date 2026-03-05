//! Diagnostics module for Zeus Compiler Core
//!
//! This module provides error reporting and diagnostic functionality.

use oxc::diagnostics::OxcDiagnostic;
use serde::{Deserialize, Serialize};

/// Diagnostic severity levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

/// A compiler diagnostic
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Diagnostic {
    /// Severity level
    pub severity: Severity,
    /// Error message
    pub message: String,
    /// Source file path
    pub file: Option<String>,
    /// Line number (1-based)
    pub line: Option<u32>,
    /// Column number (1-based)
    pub column: Option<u32>,
    /// Source code snippet
    pub source: Option<String>,
}

impl Diagnostic {
    /// Create a new error diagnostic
    pub fn error(message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Error,
            message: message.into(),
            file: None,
            line: None,
            column: None,
            source: None,
        }
    }

    /// Create a new warning diagnostic
    pub fn warning(message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Warning,
            message: message.into(),
            file: None,
            line: None,
            column: None,
            source: None,
        }
    }

    /// Create a new info diagnostic
    pub fn info(message: impl Into<String>) -> Self {
        Self {
            severity: Severity::Info,
            message: message.into(),
            file: None,
            line: None,
            column: None,
            source: None,
        }
    }

    /// Set the file path
    pub fn with_file(mut self, file: impl Into<String>) -> Self {
        self.file = Some(file.into());
        self
    }

    /// Set the line number
    pub fn with_line(mut self, line: u32) -> Self {
        self.line = Some(line);
        self
    }

    /// Set the column number
    pub fn with_column(mut self, column: u32) -> Self {
        self.column = Some(column);
        self
    }

    /// Set the source code snippet
    pub fn with_source(mut self, source: impl Into<String>) -> Self {
        self.source = Some(source.into());
        self
    }
}

/// Convert oxc diagnostics to our diagnostic format
pub fn from_oxc_error(error: &OxcDiagnostic) -> Diagnostic {
    let msg = error.to_string();

    // Try to extract position from error string
    let (line, column) = extract_position_from_string(&msg);

    Diagnostic {
        severity: Severity::Error,
        message: msg,
        file: None,
        line,
        column,
        source: None,
    }
}

/// Extract position (line, column) from error string
fn extract_position_from_string(error_str: &str) -> (Option<u32>, Option<u32>) {
    let s = error_str.to_lowercase();

    // Find "line" keyword
    if let Some(line_idx) = s.find("line") {
        let after_line = &s[line_idx + 4..];
        // Skip whitespace and find number
        if let Some(num_start) = after_line.find(|c: char| c.is_ascii_digit()) {
            let num_end = num_start
                + after_line[num_start..]
                    .find(|c: char| !c.is_ascii_digit())
                    .unwrap_or(after_line.len() - num_start);
            if let Ok(line) = after_line[num_start..num_start + num_end].parse::<u32>() {
                // Look for column after "column"
                if let Some(col_idx) = after_line[num_end..].find("column") {
                    let after_col = &after_line[num_end + col_idx + 6..];
                    if let Some(col_start) = after_col.find(|c: char| c.is_ascii_digit()) {
                        let col_end = col_start
                            + after_col[col_start..]
                                .find(|c: char| !c.is_ascii_digit())
                                .unwrap_or(after_col.len() - col_start);
                        if let Ok(col) =
                            after_col[col_start..col_start + col_end].parse::<u32>()
                        {
                            return (Some(line), Some(col));
                        }
                    }
                }
                return (Some(line), None);
            }
        }
    }

    (None, None)
}

/// Diagnostic reporter
pub struct DiagnosticReporter {
    diagnostics: Vec<Diagnostic>,
}

impl DiagnosticReporter {
    /// Create a new diagnostic reporter
    pub fn new() -> Self {
        Self {
            diagnostics: Vec::new(),
        }
    }

    /// Add a diagnostic
    pub fn add(&mut self, diagnostic: Diagnostic) {
        self.diagnostics.push(diagnostic);
    }

    /// Add an oxc error
    pub fn add_oxc_error(&mut self, error: &OxcDiagnostic) {
        self.add(from_oxc_error(error));
    }

    /// Get all diagnostics
    pub fn diagnostics(&self) -> &[Diagnostic] {
        &self.diagnostics
    }

    /// Check if there are any errors
    pub fn has_errors(&self) -> bool {
        self.diagnostics.iter().any(|d| d.severity == Severity::Error)
    }

    /// Check if there are any warnings
    pub fn has_warnings(&self) -> bool {
        self.diagnostics.iter().any(|d| d.severity == Severity::Warning)
    }

    /// Clear all diagnostics
    pub fn clear(&mut self) {
        self.diagnostics.clear();
    }
}

impl Default for DiagnosticReporter {
    fn default() -> Self {
        Self::new()
    }
}
