//! Zeus Compiler Web Component
//!
//! This crate handles Web Component-specific macro compilation:
//! - defineProps: Compile-time props definition extraction
//! - defineEmits: Compile-time custom events definition extraction
//! - defineExpose: Compile-time exposed methods/properties extraction
//!
//! These macros are designed to work with @zeus-js/web-components package.

pub mod macros;
pub mod options;

use oxc::allocator::Allocator;
use oxc::diagnostics::OxcDiagnostic;
use oxc::span::SourceType;
use zeus_compiler_core::CompilerOptions;

pub use macros::*;
pub use options::*;

/// Web Component compiler options
#[derive(Debug, Clone)]
pub struct WebComponentCompilerOptions {
    pub base: CompilerOptions,
    /// Enable macro compilation (defineProps, defineEmits, defineExpose)
    pub enable_macros: bool,
    /// Auto-detect macro usage and enable compilation automatically
    pub auto_detect: bool,
    /// Module paths for macro imports (default: "@zeus-js/web-components")
    /// Supports multiple paths as comma-separated string or array
    pub macro_modules: Vec<String>,
    /// Preserve macro calls for runtime (for debugging)
    pub preserve_macros: bool,
    /// Specific macros to process (default: all)
    pub macros: Vec<String>,
    /// Transform mode: "remove" or "noop"
    pub mode: String,
    /// Extract macro definitions for runtime
    pub extract_definitions: bool,
}

impl Default for WebComponentCompilerOptions {
    fn default() -> Self {
        Self {
            base: CompilerOptions {
                source_type: SourceType::default(),
                experimental: false,
            },
            enable_macros: true,
            auto_detect: true,
            macro_modules: vec!["@zeus-js/web-components".to_string()],
            preserve_macros: false,
            macros: vec![
                "defineProps".to_string(),
                "defineEmits".to_string(),
                "defineExpose".to_string(),
                "withDefaults".to_string(),
            ],
            mode: "remove".to_string(),
            extract_definitions: false,
        }
    }
}

/// Web Component compiler compilation result
#[derive(Debug, Clone)]
pub struct CompileResult {
    /// Transformed source code
    pub code: String,
    /// Extracted macro definitions (props, emits, expose)
    pub macros: MacroDefinitions,
    /// Whether any macros were found and processed
    pub macros_found: bool,
}

/// Extracted macro definitions from source
#[derive(Debug, Clone, Default, serde::Serialize)]
pub struct MacroDefinitions {
    /// Props definition extracted from defineProps
    #[serde(skip_serializing_if = "Option::is_none")]
    pub props: Option<PropsDefinition>,
    /// Emits definition extracted from defineEmits
    #[serde(skip_serializing_if = "Option::is_none")]
    pub emits: Option<EmitsDefinition>,
    /// Expose definition extracted from defineExpose
    #[serde(skip_serializing_if = "Option::is_none")]
    pub expose: Option<ExposeDefinition>,
}

/// Props definition
#[derive(Debug, Clone, serde::Serialize)]
pub struct PropsDefinition {
    /// Raw source of props definition
    pub source: String,
    /// Parsed props keys
    pub keys: Vec<String>,
}

/// Emits definition
#[derive(Debug, Clone, serde::Serialize)]
pub struct EmitsDefinition {
    /// Raw source of emits definition
    pub source: String,
    /// Parsed event names
    pub events: Vec<String>,
}

/// Expose definition
#[derive(Debug, Clone, serde::Serialize)]
pub struct ExposeDefinition {
    /// Raw source of expose definition
    pub source: String,
    /// Parsed exposed keys
    pub keys: Vec<String>,
}

/// Web Component compiler
pub struct WebComponentCompiler;

impl WebComponentCompiler {
    pub fn new() -> Self {
        Self
    }

    /// Main compilation entry point
    pub fn compile(
        &self,
        source: &str,
        options: &WebComponentCompilerOptions,
    ) -> Result<CompileResult, OxcDiagnostic> {
        // If macros are disabled and not auto-detecting, return original source
        if !options.enable_macros && !options.auto_detect {
            return Ok(CompileResult {
                code: source.to_string(),
                macros: MacroDefinitions::default(),
                macros_found: false,
            });
        }

        let allocator = Allocator::default();
        let source_type = options.base.source_type;

        // Parse source to validate it (we don't use AST for simplicity)
        let parser = oxc::parser::Parser::new(&allocator, source, source_type);
        let result = parser.parse();

        if !result.errors.is_empty() {
            return Err(result.errors.into_iter().next().unwrap());
        }

        // Use simple string-based macro visitor
        let mut macro_visitor = MacroVisitor::new(source);
        macro_visitor.visit();

        let macros_found = macro_visitor.has_macros();

        // Check if we should process based on auto_detect
        if options.auto_detect && !macros_found && !options.enable_macros {
            return Ok(CompileResult {
                code: source.to_string(),
                macros: macro_visitor.into_definitions(),
                macros_found,
            });
        }

        // Transform source
        let transformed = if options.preserve_macros {
            source.to_string()
        } else {
            macro_visitor.transform()
        };

        Ok(CompileResult {
            code: transformed,
            macros: macro_visitor.into_definitions(),
            macros_found,
        })
    }

    /// Compile only (without extracting definitions)
    pub fn transform(
        &self,
        source: &str,
        options: &WebComponentCompilerOptions,
    ) -> Result<String, OxcDiagnostic> {
        self.compile(source, options).map(|r| r.code)
    }
}

impl Default for WebComponentCompiler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn compile(source: &str) -> CompileResult {
        let compiler = WebComponentCompiler::new();
        let options = WebComponentCompilerOptions::default();
        compiler
            .compile(source, &options)
            .expect("compilation failed")
    }

    #[test]
    fn test_define_props() {
        let result = compile(
            r#"
const buttonProps = defineProps({
  variant: { type: String, default: 'primary' },
  size: { type: String, default: 'medium' },
  disabled: Boolean,
})
"#,
        );
        println!("Output:\n{}", result.code);
        assert!(result.macros_found);
        assert!(result.macros.props.is_some());
    }

    #[test]
    fn test_define_emits() {
        let result = compile(
            r#"
const buttonEmits = defineEmits({
  click: undefined,
  custom: (val) => typeof val === 'string',
})
"#,
        );
        println!("Output:\n{}", result.code);
        assert!(result.macros_found);
        assert!(result.macros.emits.is_some());
    }

    #[test]
    fn test_define_expose() {
        let result = compile(
            r#"
const buttonExpose = defineExpose({
  focus: function() { console.log('focused'); },
})
"#,
        );
        println!("Output:\n{}", result.code);
        assert!(result.macros_found);
        assert!(result.macros.expose.is_some());
    }

    #[test]
    fn test_no_macros() {
        let result = compile(
            r#"
const buttonProps = {
  variant: { type: String, default: 'primary' },
}
"#,
        );
        println!("Output:\n{}", result.code);
        assert!(!result.macros_found);
    }
}
