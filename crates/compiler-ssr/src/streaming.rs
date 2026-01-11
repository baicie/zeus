//! Streaming SSR module for Zeus Compiler SSR
//!
//! This module handles resumable streaming server-side rendering.

use std::collections::HashMap;

/// Streaming configuration
#[derive(Debug, Clone)]
pub struct StreamingConfig {
    /// Enable streaming
    pub enabled: bool,
    /// Buffer size for streaming chunks
    pub buffer_size: usize,
    /// Maximum streaming delay
    pub max_delay_ms: u64,
}

impl Default for StreamingConfig {
    fn default() -> Self {
        Self {
            enabled: true,
            buffer_size: 8192,
            max_delay_ms: 100,
        }
    }
}

/// Streaming renderer
pub struct StreamingRenderer {
    config: StreamingConfig,
    chunks: HashMap<String, Vec<String>>,
}

impl StreamingRenderer {
    /// Create a new streaming renderer
    pub fn new(config: StreamingConfig) -> Self {
        Self {
            config,
            chunks: HashMap::new(),
        }
    }

    /// Start streaming for a component
    pub fn start_stream(&mut self, component_id: &str) -> String {
        let start_marker = format!(r#"<div data-stream-id="{}" data-streaming><!--"#, component_id);
        self.chunks.insert(component_id.to_string(), Vec::new());
        start_marker
    }

    /// Add content chunk to streaming component
    pub fn add_chunk(&mut self, component_id: &str, content: &str) {
        if let Some(chunks) = self.chunks.get_mut(component_id) {
            chunks.push(content.to_string());
        }
    }

    /// End streaming for a component
    pub fn end_stream(&mut self, _component_id: &str) -> String {
        let end_marker = "--></div>";
        // TODO: Process all chunks and generate final HTML
        end_marker.to_string()
    }

    /// Get all chunks for a component
    pub fn get_chunks(&self, component_id: &str) -> Option<&Vec<String>> {
        self.chunks.get(component_id)
    }

    /// Check if streaming is enabled
    pub fn is_streaming_enabled(&self) -> bool {
        self.config.enabled
    }
}

impl Default for StreamingRenderer {
    fn default() -> Self {
        Self::new(StreamingConfig::default())
    }
}

/// Stream chunk types
#[derive(Debug, Clone)]
pub enum StreamChunk {
    /// HTML content chunk
    Html(String),
    /// Component data
    Data(serde_json::Value),
    /// Script chunk
    Script(String),
    /// Style chunk
    Style(String),
}

impl StreamChunk {
    /// Get the size of the chunk
    pub fn size(&self) -> usize {
        match self {
            StreamChunk::Html(content) => content.len(),
            StreamChunk::Data(data) => data.to_string().len(),
            StreamChunk::Script(script) => script.len(),
            StreamChunk::Style(style) => style.len(),
        }
    }

    /// Convert chunk to HTML string
    pub fn to_html(&self) -> String {
        match self {
            StreamChunk::Html(content) => content.clone(),
            StreamChunk::Data(data) => format!(r#"<script type="application/json">{}</script>"#, data),
            StreamChunk::Script(script) => format!("<script>{}</script>", script),
            StreamChunk::Style(style) => format!("<style>{}</style>", style),
        }
    }
}
