//! Compiler options module
//!
//! Defines configuration options for the Web Component compiler

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

    /// Set a single macro module path
    pub fn macro_module(mut self, module: &str) -> Self {
        self.options.macro_modules = vec![module.to_string()];
        self
    }

    /// Set multiple macro module paths
    pub fn macro_modules(mut self, modules: Vec<String>) -> Self {
        self.options.macro_modules = modules;
        self
    }

    pub fn preserve_macros(mut self, preserve: bool) -> Self {
        self.options.preserve_macros = preserve;
        self
    }

    /// Set specific macros to process
    pub fn macros(mut self, macros: Vec<String>) -> Self {
        self.options.macros = macros;
        self
    }

    /// Set transform mode: "remove" or "noop"
    pub fn mode(mut self, mode: &str) -> Self {
        self.options.mode = mode.to_string();
        self
    }

    /// Enable extracting macro definitions
    pub fn extract_definitions(mut self, extract: bool) -> Self {
        self.options.extract_definitions = extract;
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
            .macros(vec!["defineProps".to_string(), "defineEmits".to_string()])
            .mode("remove")
            .build();

        assert!(options.enable_macros);
        assert!(!options.auto_detect);
        assert_eq!(options.macro_modules, vec!["@custom/web-components".to_string()]);
        assert_eq!(options.macros.len(), 2);
        assert_eq!(options.mode, "remove");
    }

    #[test]
    fn test_builder_multiple_modules() {
        let options = WebComponentCompilerOptionsBuilder::new()
            .macro_modules(vec![
                "@zeus-js/web-components".to_string(),
                "@addons/web-components".to_string(),
            ])
            .build();

        assert_eq!(options.macro_modules.len(), 2);
    }
}
