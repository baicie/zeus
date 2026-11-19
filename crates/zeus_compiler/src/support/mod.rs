//! Leaf-level helpers shared by every compiler stage.
//!
//! Nothing here knows about JSX, the IR or code emission. Each module answers
//! one question that more than one stage asks: what is this source position,
//! what does this diagnostic look like to a host, how is HTML escaped, how deep
//! is this input, what does a hydration or HMR plan contain.
//!
//! Keeping them leaf-level is what lets `frontend`, `lowering` and `codegen`
//! depend on `support` without depending on each other.

pub mod diagnostic;
pub mod hmr;
pub mod html;
pub mod hydration;
pub mod nesting;
pub mod span;
