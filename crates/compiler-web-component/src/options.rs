//! Compiler options module
//!
//! Defines configuration options for the Web Component compiler

/// Options are already defined in lib.rs as WebComponentCompilerOptions
/// This module can be extended with additional option builders or helpers

use crate::WebComponentCompilerOptions;

/// Builder for WebComponentCompilerOptions
pub struct WebComponentCompilerOptionsBuilder {
    options: WebComponentCompilerOptions,
}

impl WebComponentCompilerOptionsBuilder {
    pub fn new() -> Self {
        Self {
            options: WebComponentCompilerOptions::default(),
        }
    }

    pub fn enable_macros(mut self, enable: bool) -> Self {
        self.options.enable_macros = enable;
        self
    }

    pub fn auto_detect(mut self, auto_detect: bool) -> Self {
        self.options.auto_detect = auto_detect;
        self
    }

    pub fn macro_module(mut self, module: &str) -> Self {
        self.options.macro_module = Some(module.to_string());
        self
    }

    pub fn preserve_macros(mut self, preserve: bool) -> Self {
        self.options.preserve_macros = preserve;
        self
    }

    pub fn build(self) -> WebComponentCompilerOptions {
        self.options
    }
}

impl Default for WebComponentCompilerOptionsBuilder {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_builder() {
        let options = WebComponentCompilerOptionsBuilder::new()
            .enable_macros(true)
            .auto_detect(false)
            .macro_module("@custom/web-components")
            .build();

        assert!(options.enable_macros);
        assert!(!options.auto_detect);
        assert_eq!(options.macro_module, Some("@custom/web-components".to_string()));
    }
}
