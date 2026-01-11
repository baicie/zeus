//! Common data types used across compiler crates

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Compilation target information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TargetInfo {
    /// Target platform
    pub platform: super::config::Platform,
    /// Target architecture
    pub arch: String,
    /// Target operating system
    pub os: String,
    /// Target environment
    pub env: String,
}

/// Compilation statistics
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompileStats {
    /// Compilation time in milliseconds
    pub compile_time_ms: u64,
    /// Input source size in bytes
    pub input_size: usize,
    /// Output size in bytes
    pub output_size: usize,
    /// Number of modules processed
    pub modules_count: usize,
    /// Number of warnings
    pub warnings_count: usize,
    /// Number of errors
    pub errors_count: usize,
}

/// Module information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModuleInfo {
    /// Module ID
    pub id: String,
    /// Module path
    pub path: String,
    /// Module dependencies
    pub dependencies: Vec<String>,
    /// Is entry module
    pub is_entry: bool,
    /// Module size in bytes
    pub size: usize,
}

/// Bundle information
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BundleInfo {
    /// Bundle name
    pub name: String,
    /// Bundle size in bytes
    pub size: usize,
    /// Bundle modules
    pub modules: Vec<ModuleInfo>,
    /// Bundle format
    pub format: super::config::OutputFormat,
    /// Target platform
    pub platform: super::config::Platform,
}

/// Transformation result
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransformResult {
    /// Transformed code
    pub code: String,
    /// Source map (if generated)
    pub map: Option<String>,
    /// Transformation metadata
    pub metadata: HashMap<String, serde_json::Value>,
}

/// Plugin context for transformation plugins
#[derive(Debug, Clone)]
pub struct PluginContext {
    /// Current working directory
    pub cwd: String,
    /// Environment variables
    pub env: HashMap<String, String>,
    /// Build mode
    pub mode: BuildMode,
    /// Target information
    pub target: TargetInfo,
}

impl Default for PluginContext {
    fn default() -> Self {
        Self {
            cwd: ".".to_string(),
            env: HashMap::new(),
            mode: BuildMode::Development,
            target: TargetInfo {
                platform: super::config::Platform::Browser,
                arch: "x86_64".to_string(),
                os: "unknown".to_string(),
                env: "development".to_string(),
            },
        }
    }
}

/// Build mode
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum BuildMode {
    /// Development mode
    Development,
    /// Production mode
    Production,
    /// Testing mode
    Test,
}

impl Default for BuildMode {
    fn default() -> Self {
        Self::Development
    }
}

/// Cache entry for compilation results
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CacheEntry {
    /// Cache key
    pub key: String,
    /// Cached data
    pub data: Vec<u8>,
    /// Creation timestamp
    pub created_at: u64,
    /// Expiration timestamp (0 means never expires)
    pub expires_at: u64,
}

/// File system abstraction for compiler operations
pub trait FileSystem {
    /// Read file content
    fn read_file(&self, path: &str) -> super::error::Result<String>;

    /// Write file content
    fn write_file(&self, path: &str, content: &str) -> super::error::Result<()>;

    /// Check if file exists
    fn file_exists(&self, path: &str) -> bool;

    /// Get file modification time
    fn file_modified(&self, path: &str) -> super::error::Result<u64>;

    /// Create directory
    fn create_dir(&self, path: &str) -> super::error::Result<()>;

    /// List directory contents
    fn read_dir(&self, path: &str) -> super::error::Result<Vec<String>>;
}

/// Default file system implementation
pub struct DefaultFileSystem;

impl FileSystem for DefaultFileSystem {
    fn read_file(&self, path: &str) -> super::error::Result<String> {
        std::fs::read_to_string(path).map_err(super::error::CompilerError::io)
    }

    fn write_file(&self, path: &str, content: &str) -> super::error::Result<()> {
        std::fs::write(path, content).map_err(super::error::CompilerError::io)
    }

    fn file_exists(&self, path: &str) -> bool {
        std::fs::metadata(path).is_ok()
    }

    fn file_modified(&self, path: &str) -> super::error::Result<u64> {
        let metadata = std::fs::metadata(path).map_err(super::error::CompilerError::io)?;
        let modified = metadata.modified()
            .map_err(|e| super::error::CompilerError::io(e))?;
        Ok(modified.duration_since(std::time::UNIX_EPOCH)
            .map_err(|e| super::error::CompilerError::other(e.to_string()))?
            .as_secs())
    }

    fn create_dir(&self, path: &str) -> super::error::Result<()> {
        std::fs::create_dir_all(path).map_err(super::error::CompilerError::io)
    }

    fn read_dir(&self, path: &str) -> super::error::Result<Vec<String>> {
        let entries = std::fs::read_dir(path).map_err(super::error::CompilerError::io)?;
        let mut files = Vec::new();
        for entry in entries {
            let entry = entry.map_err(super::error::CompilerError::io)?;
            if let Some(file_name) = entry.file_name().to_str() {
                files.push(file_name.to_string());
            }
        }
        Ok(files)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_target_info() {
        use crate::Platform;

        let target = TargetInfo {
            platform: Platform::Browser,
            arch: "x86_64".to_string(),
            os: "linux".to_string(),
            env: "production".to_string(),
        };
        assert_eq!(target.platform.as_str(), "browser");
    }

    #[test]
    fn test_compile_stats() {
        let stats = CompileStats {
            compile_time_ms: 100,
            input_size: 1000,
            output_size: 800,
            modules_count: 5,
            warnings_count: 1,
            errors_count: 0,
        };
        assert_eq!(stats.compile_time_ms, 100);
    }

    #[test]
    fn test_build_mode_default() {
        assert_eq!(BuildMode::default(), BuildMode::Development);
    }
}
