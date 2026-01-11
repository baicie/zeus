//! Zeus Compiler Universal
//!
//! This crate provides universal compilation functionality that works across
//! different platforms (browser, server, mobile, desktop) for the Zeus framework.
//! It provides a unified API for multi-platform code generation and optimization.

pub mod platforms;
pub mod bundler;
pub mod optimizer;
pub mod plugins;

use zeus_compiler_core::{Compiler, CompilerOptions};
use zeus_compiler_dom::DomCompiler;
use zeus_compiler_ssr::SsrCompiler;
#[cfg(test)]
use oxc::span::SourceType;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Target platform types
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

/// Universal compilation options
#[derive(Debug, Clone)]
pub struct UniversalCompilerOptions {
    /// Base compiler options
    pub base: CompilerOptions,
    /// Target platforms
    pub platforms: Vec<Platform>,
    /// Enable tree shaking
    pub tree_shake: bool,
    /// Enable minification
    pub minify: bool,
    /// Enable source maps
    pub sourcemap: bool,
    /// Bundle options
    pub bundle: BundleOptions,
}

/// Bundle configuration
#[derive(Debug, Clone)]
pub struct BundleOptions {
    /// Entry points for each platform
    pub entries: HashMap<Platform, String>,
    /// External dependencies
    pub externals: Vec<String>,
    /// Output format
    pub format: BundleFormat,
}

/// Bundle output format
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BundleFormat {
    /// ES modules
    Esm,
    /// CommonJS
    Cjs,
    /// Immediately Invoked Function Expression
    Iife,
    /// Universal Module Definition
    Umd,
}

/// Universal compilation result
#[derive(Debug, Clone)]
pub struct UniversalResult {
    /// Results for each platform
    pub platform_results: HashMap<Platform, PlatformResult>,
    /// Shared chunks
    pub shared_chunks: Vec<String>,
    /// Source maps
    pub sourcemaps: HashMap<String, String>,
}

/// Platform-specific compilation result
#[derive(Debug, Clone)]
pub struct PlatformResult {
    /// Generated code
    pub code: String,
    /// Bundle size in bytes
    pub size: usize,
    /// Dependencies
    pub dependencies: Vec<String>,
    /// Platform-specific optimizations applied
    pub optimizations: Vec<String>,
}

/// Universal Compiler - orchestrates compilation across multiple platforms
pub struct UniversalCompiler {
    core_compiler: Compiler,
    dom_compiler: DomCompiler,
    ssr_compiler: SsrCompiler,
}

impl UniversalCompiler {
    /// Create a new universal compiler instance
    pub fn new() -> Self {
        Self {
            core_compiler: Compiler::new(),
            dom_compiler: DomCompiler::new(),
            ssr_compiler: SsrCompiler::new(),
        }
    }

    /// Compile code for multiple platforms
    pub fn compile_universal(&self, source: &str, options: &UniversalCompilerOptions) -> Result<UniversalResult, oxc::diagnostics::Error> {
        let mut platform_results = HashMap::new();

        for &platform in &options.platforms {
            let result = self.compile_for_platform(source, platform, options)?;
            platform_results.insert(platform, result);
        }

        Ok(UniversalResult {
            platform_results,
            shared_chunks: Vec::new(), // TODO: Implement shared chunk detection
            sourcemaps: HashMap::new(), // TODO: Generate source maps
        })
    }

    /// Compile for a specific platform
    fn compile_for_platform(
        &self,
        source: &str,
        platform: Platform,
        options: &UniversalCompilerOptions,
    ) -> Result<PlatformResult, oxc::diagnostics::Error> {
        match platform {
            Platform::Browser => self.compile_for_browser(source, options),
            Platform::Server => self.compile_for_server(source, options),
            Platform::Mobile => self.compile_for_mobile(source, options),
            Platform::Desktop => self.compile_for_desktop(source, options),
            Platform::Wasm => self.compile_for_wasm(source, options),
        }
    }

    /// Compile for browser platform
    fn compile_for_browser(&self, source: &str, options: &UniversalCompilerOptions) -> Result<PlatformResult, oxc::diagnostics::Error> {
        // Use DOM compiler with browser-specific optimizations
        let dom_options = zeus_compiler_dom::DomCompilerOptions {
            base: options.base.clone(),
            jsx: true,
            jsx_pragma: Some("React.createElement".to_string()),
            jsx_pragma_frag: Some("React.Fragment".to_string()),
            dom_optimizations: true,
        };

        let code = self.dom_compiler.compile_dom(source, &dom_options)?;

        Ok(PlatformResult {
            code: code.clone(),
            size: code.len(),
            dependencies: vec!["react".to_string(), "react-dom".to_string()],
            optimizations: vec!["JSX transform".to_string(), "DOM optimizations".to_string()],
        })
    }

    /// Compile for server platform
    fn compile_for_server(&self, source: &str, options: &UniversalCompilerOptions) -> Result<PlatformResult, oxc::diagnostics::Error> {
        // Use SSR compiler
        let ssr_options = zeus_compiler_ssr::SsrCompilerOptions {
            base: options.base.clone(),
            streaming: true,
            hydration: true,
            data_fetching: true,
            suspense: true,
        };

        let result = self.ssr_compiler.compile_for_ssr(source, &ssr_options)?;
        let code = result.html; // For server, we return the rendered HTML

        Ok(PlatformResult {
            code: code.clone(),
            size: code.len(),
            dependencies: vec!["react".to_string(), "react-dom/server".to_string()],
            optimizations: vec!["SSR".to_string(), "Streaming".to_string()],
        })
    }

    /// Compile for mobile platform
    fn compile_for_mobile(&self, source: &str, options: &UniversalCompilerOptions) -> Result<PlatformResult, oxc::diagnostics::Error> {
        // React Native specific compilation
        let code = self.core_compiler.compile(source, &options.base)?;

        Ok(PlatformResult {
            code: code.clone(),
            size: code.len(),
            dependencies: vec!["react-native".to_string()],
            optimizations: vec!["React Native".to_string()],
        })
    }

    /// Compile for desktop platform
    fn compile_for_desktop(&self, source: &str, options: &UniversalCompilerOptions) -> Result<PlatformResult, oxc::diagnostics::Error> {
        // Electron/Tauri specific compilation
        let code = self.core_compiler.compile(source, &options.base)?;

        Ok(PlatformResult {
            code: code.clone(),
            size: code.len(),
            dependencies: vec!["electron".to_string()],
            optimizations: vec!["Desktop".to_string()],
        })
    }

    /// Compile for WebAssembly platform
    fn compile_for_wasm(&self, source: &str, options: &UniversalCompilerOptions) -> Result<PlatformResult, oxc::diagnostics::Error> {
        // WebAssembly specific compilation
        let code = self.core_compiler.compile(source, &options.base)?;

        Ok(PlatformResult {
            code: code.clone(),
            size: code.len(),
            dependencies: Vec::new(),
            optimizations: vec!["WebAssembly".to_string()],
        })
    }

    /// Get supported platforms
    pub fn supported_platforms() -> Vec<Platform> {
        vec![
            Platform::Browser,
            Platform::Server,
            Platform::Mobile,
            Platform::Desktop,
            Platform::Wasm,
        ]
    }
}

impl Default for UniversalCompiler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_universal_compiler_creation() {
        let _compiler = UniversalCompiler::new();
        assert!(true); // Basic smoke test
    }

    #[test]
    fn test_supported_platforms() {
        let platforms = UniversalCompiler::supported_platforms();
        assert_eq!(platforms.len(), 5);
        assert!(platforms.contains(&Platform::Browser));
        assert!(platforms.contains(&Platform::Server));
    }

    #[test]
    fn test_compile_universal() {
        let compiler = UniversalCompiler::new();
        let options = UniversalCompilerOptions {
            base: CompilerOptions {
                source_type: SourceType::default(),
                experimental: false,
            },
            platforms: vec![Platform::Browser],
            tree_shake: true,
            minify: false,
            sourcemap: false,
            bundle: BundleOptions {
                entries: HashMap::new(),
                externals: Vec::new(),
                format: BundleFormat::Esm,
            },
        };

        let result = compiler.compile_universal("console.log('universal');", &options);
        assert!(result.is_ok());
    }
}
