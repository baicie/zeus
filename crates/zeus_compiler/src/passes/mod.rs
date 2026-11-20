//! Compiler passes: transformations over the module IR.
//!
//! A pass reads the IR and produces a result plus, where the target needs it, a
//! rewritten IR. It runs between lowering and emission, and it belongs to
//! neither: `support` holds data contracts and leaf utilities, `codegen` writes
//! output.

pub(crate) mod hmr;
