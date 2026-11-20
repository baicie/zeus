//! Per-stage timing, compiled out unless asked for.
//!
//! The pipeline could already report whole-module latency
//! (`examples/perf-baseline.rs`), but not which stage spent it. When the whole
//! number moves, the next question is "which stage?", and answering it meant
//! bisecting by commenting stages out.
//!
//! **Off at compile time.** There is no runtime flag to check on every compile:
//! a `bool` read on the production path is a cost for a measurement nobody
//! asked for. The `stage-timing` cargo feature compiles the instrumentation in;
//! without it [`timed`] is `body()` and the optimizer removes the rest.
//!
//! ```text
//! cargo run -p zeus_compiler --example perf-baseline --release \
//!   --features stage-timing
//! ```

use std::fmt::Write as _;

/// The stages a compile is divided into, in pipeline order.
///
/// These are reporting labels, not pipeline structure: `pipeline.rs` decides
/// when a stage runs, this decides what to call it in a report.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Stage {
    NestingGuard,
    Lower,
    Validate,
    Analysis,
    Emit,
}

impl Stage {
    pub const ALL: [Self; 5] = [
        Self::NestingGuard,
        Self::Lower,
        Self::Validate,
        Self::Analysis,
        Self::Emit,
    ];

    pub const fn name(self) -> &'static str {
        match self {
            Self::NestingGuard => "nesting-guard",
            Self::Lower => "lower",
            Self::Validate => "validate",
            Self::Analysis => "analysis",
            Self::Emit => "emit",
        }
    }

    const fn index(self) -> usize {
        self as usize
    }
}

#[cfg(feature = "stage-timing")]
static TOTALS: std::sync::Mutex<[u128; 5]> = std::sync::Mutex::new([0; 5]);

/// Clears the accumulated totals.
pub fn reset() {
    #[cfg(feature = "stage-timing")]
    if let Ok(mut totals) = TOTALS.lock() {
        *totals = [0; 5];
    }
}

/// The accumulated nanoseconds per stage.
pub fn snapshot() -> [u128; 5] {
    #[cfg(feature = "stage-timing")]
    {
        return match TOTALS.lock() {
            Ok(totals) => *totals,
            // A poisoned lock means a previous timing panicked; report zeros
            // rather than propagate.
            Err(_) => [0; 5],
        };
    }
    #[cfg(not(feature = "stage-timing"))]
    {
        [0; 5]
    }
}

/// Runs `body`, attributing its time to `stage`.
///
/// In a build without the feature this is the body and nothing else — no
/// branch, no allocation, no call after inlining.
#[inline]
pub fn timed<T>(stage: Stage, body: impl FnOnce() -> T) -> T {
    // One expression, not two `#[cfg]` blocks with a `return`: the block form
    // makes clippy's `needless_return` fire in the feature build, and the
    // single-expression form compiles to the same thing in both.
    #[cfg(feature = "stage-timing")]
    let _guard = TimerGuard::start(stage);
    #[cfg(not(feature = "stage-timing"))]
    let _ = stage;
    body()
}

/// Stops the clock when dropped, so an early return inside `body` is still
/// attributed to its stage.
#[cfg(feature = "stage-timing")]
struct TimerGuard {
    stage: Stage,
    started: std::time::Instant,
}

#[cfg(feature = "stage-timing")]
impl TimerGuard {
    fn start(stage: Stage) -> Self {
        Self {
            stage,
            started: std::time::Instant::now(),
        }
    }
}

#[cfg(feature = "stage-timing")]
impl Drop for TimerGuard {
    fn drop(&mut self) {
        // A poisoned lock means a previous timing panicked. Timing must never
        // take a compile down, so the sample is dropped.
        if let Ok(mut totals) = TOTALS.lock() {
            totals[self.stage.index()] += self.started.elapsed().as_nanos();
        }
    }
}

/// A formatted report of accumulated stage times, or an empty string when
/// nothing was collected so a caller can print it unconditionally.
pub fn report() -> String {
    let totals = snapshot();
    let total: u128 = totals.iter().sum();
    if total == 0 {
        return String::new();
    }

    let mut out = String::from("stage timing (cumulative):\n");
    for stage in Stage::ALL {
        let ns = totals[stage.index()];
        // Nanosecond totals of one compile are far below 2^52, so the u128 ->
        // f64 cast is exact for every value this can produce.
        #[allow(clippy::cast_precision_loss)]
        let share = (ns as f64 / total as f64) * 100.0;
        {
            #[allow(clippy::cast_precision_loss)]
            let millis = ns as f64 / 1_000_000.0;
            let _ = writeln!(
                out,
                "  {:<14} {:>10.3} ms  {:>5.1}%",
                stage.name(),
                millis,
                share
            );
        }
    }
    out
}
