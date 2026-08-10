//! Thin Node-API adapter for the Zeus Rust compiler.

// The exported transformModule contract is added after the pure Rust API is
// compiled and tested. Keeping this crate buildable prevents ABI concerns from
// leaking into compiler core while that contract settles.
