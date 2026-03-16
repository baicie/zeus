//! Hydration analyzer module

/// Hydration info
#[derive(Debug, Clone)]
pub struct HydrationInfo {
    /// Markers
    pub markers: Vec<HydrationMarker>,
}

/// Hydration marker
#[derive(Debug, Clone)]
pub struct HydrationMarker {
    /// Marker type
    pub marker_type: MarkerType,
    /// Position
    pub position: usize,
}

/// Marker type
#[derive(Debug, Clone, Copy)]
pub enum MarkerType {
    /// Node start
    NodeStart,
    /// Node end
    NodeEnd,
}

/// Hydration analyzer
pub struct HydrationAnalyzer;

impl HydrationAnalyzer {
    /// Create a new hydration analyzer
    pub fn new() -> Self {
        Self
    }

    /// Analyze for hydration
    pub fn analyze(&self) -> HydrationInfo {
        HydrationInfo {
            markers: Vec::new(),
        }
    }
}

impl Default for HydrationAnalyzer {
    fn default() -> Self {
        Self::new()
    }
}
