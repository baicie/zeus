//! Common configuration structures used across compiler crates

use oxc::span::SourceType;
use serde::{Deserialize, Serialize};

/// Base compiler configuration shared across all compiler crates
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BaseCompilerOptions {
    /// Source type as string (JavaScript, TypeScript, JSX, etc.)
    pub source_type: String,
    /// Enable experimental features
    pub experimental: bool,
    /// Target ECMAScript version
    pub target: String,
    /// Minification enabled
    pub minify: bool,
    /// Source maps enabled
    pub sourcemap: bool,
}

impl BaseCompilerOptions {
    /// Convert to oxc SourceType
    pub fn to_oxc_source_type(&self) -> SourceType {
        match self.source_type.as_str() {
            "jsx" => SourceType::jsx(),
            "ts" | "typescript" => SourceType::ts(),
            "tsx" => SourceType::tsx(),
            _ => SourceType::default(),
        }
    }
}

impl Default for BaseCompilerOptions {
    fn default() -> Self {
        Self {
            source_type: "js".to_string(),
            experimental: false,
            target: "es2020".to_string(),
            minify: false,
            sourcemap: false,
        }
    }
}

/// Output format options
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum OutputFormat {
    /// ES modules
    #[default]
    Esm,
    /// CommonJS
    Cjs,
    /// Immediately Invoked Function Expression
    Iife,
    /// Universal Module Definition
    Umd,
}


/// Optimization level
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum OptimizationLevel {
    /// No optimizations
    None,
    /// Basic optimizations
    #[default]
    Basic,
    /// Advanced optimizations
    Advanced,
    /// Aggressive optimizations
    Aggressive,
}


/// Platform target
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum Platform {
    /// Web browser
    Browser,
    /// Node.js server
    Server,
    /// Mobile (React Native)
    Mobile,
    /// Desktop (Electron/Tauri)
    Desktop,
    /// WebAssembly
    Wasm,
}

impl Platform {
    /// Get all supported platforms
    pub fn all() -> Vec<Self> {
        vec![Self::Browser, Self::Server, Self::Mobile, Self::Desktop, Self::Wasm]
    }

    /// Get platform name as string
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Browser => "browser",
            Self::Server => "server",
            Self::Mobile => "mobile",
            Self::Desktop => "desktop",
            Self::Wasm => "wasm",
        }
    }
}

/// Bundle options
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleOptions {
    /// Entry points
    pub entries: Vec<String>,
    /// Output directory
    pub out_dir: String,
    /// External dependencies
    pub externals: Vec<String>,
    /// Output format
    pub format: OutputFormat,
    /// Platform targets
    pub platforms: Vec<Platform>,
}

impl Default for BundleOptions {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
            out_dir: "dist".to_string(),
            externals: Vec::new(),
            format: OutputFormat::default(),
            platforms: vec![Platform::Browser],
        }
    }
}

/// Diagnostic severity levels
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Severity {
    Error,
    Warning,
    Info,
}

/// Compiler diagnostic
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
