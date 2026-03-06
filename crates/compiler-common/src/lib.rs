//! Zeus Compiler Common
//!
//! This crate provides common types, utilities, and shared functionality
//! used across all Zeus compiler crates.

pub mod config;
pub mod error;
pub mod utils;
pub mod types;

// Re-export commonly used types
pub use config::*;
pub use error::*;
pub use types::*;

// Version information
pub const VERSION: &str = env!("CARGO_PKG_VERSION");

/// Get the current version of the compiler common library
pub fn version() -> &'static str {
    VERSION
}

// Common result type used across compiler crates is defined in error.rs

/// Initialize the compiler common library
pub fn init() {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_version() {
        assert!(!version().is_empty());
    }

    #[test]
    fn test_init() {
        init(); // Should not panic
    }
}
