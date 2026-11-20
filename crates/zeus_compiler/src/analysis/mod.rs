//! Analysis: reads the lowered IR and derives facts later stages consume.
//!
//! An analysis module does not emit code and does not rewrite the IR. Its
//! output is a plan or a set of facts that the emitter is handed, which is what
//! lets the emitter stop re-deriving them.

pub(crate) mod hydration;
