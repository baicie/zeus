//! Macro processing module
//!
//! Handles macro extraction for defineProps, defineEmits, defineExpose
//! using simple string pattern matching for simplicity.

use crate::{
    EmitsDefinition, ExposeDefinition, MacroDefinitions, PropsDefinition,
};

/// Known macro names
const DEFINE_PROPS_NAME: &str = "defineProps";
const DEFINE_EMITS_NAME: &str = "defineEmits";
const DEFINE_EXPOSE_NAME: &str = "defineExpose";

/// Macro visitor using simple string-based pattern matching
pub struct MacroVisitor {
    source: String,
    has_macros: bool,
    props: Option<PropsDefinition>,
    emits: Option<EmitsDefinition>,
    expose: Option<ExposeDefinition>,
    replacements: Vec<(usize, usize, String)>,
}

impl MacroVisitor {
    pub fn new(source: &str) -> Self {
        Self {
            source: source.to_string(),
            has_macros: false,
            props: None,
            emits: None,
            expose: None,
            replacements: Vec::new(),
        }
    }

    pub fn has_macros(&self) -> bool {
        self.has_macros
    }

    pub fn into_definitions(self) -> MacroDefinitions {
        MacroDefinitions {
            props: self.props,
            emits: self.emits,
            expose: self.expose,
        }
    }

    /// Apply all transformations to generate the final output
    pub fn transform(&self) -> String {
        if self.replacements.is_empty() {
            return self.source.clone();
        }

        let mut result = self.source.clone();

        // Sort by position in reverse order
        let mut reps = self.replacements.clone();
        reps.sort_by(|a, b| b.0.cmp(&a.0));

        for (start, end, replacement) in reps {
            if start < result.len() && end <= result.len() {
                result.replace_range(start..end, &replacement);
            }
        }
        result
    }

    /// Visit the source and find all macro calls
    pub fn visit(&mut self) {
        self.find_define_props();
        self.find_define_emits();
        self.find_define_expose();
    }

    /// Find defineProps macros
    fn find_define_props(&mut self) {
        let source = &self.source;
        let mut search_start = 0;

        while let Some(start) = source[search_start..].find(DEFINE_PROPS_NAME) {
            let full_start = search_start + start;
            let macro_end = full_start + DEFINE_PROPS_NAME.len();

            let paren_start = self.find_next_char(macro_end, '(');
            if let Some(paren_start) = paren_start {
                if let Some((_, obj_end)) = self.find_matching_paren(paren_start) {
                    let obj_source = &source[paren_start..=obj_end];
                    let keys = self.extract_object_keys(obj_source);
                    let full_macro_source = source[full_start..=obj_end].to_string();

                    self.has_macros = true;
                    self.props = Some(PropsDefinition {
                        source: full_macro_source,
                        keys,
                    });

                    // Add replacement: defineProps({...}) -> {...}
                    self.replacements.push((full_start, obj_end + 1, obj_source.to_string()));
                }
            }

            search_start = macro_end;
        }
    }

    /// Find defineEmits macros
    fn find_define_emits(&mut self) {
        let source = &self.source;
        let mut search_start = 0;

        while let Some(start) = source[search_start..].find(DEFINE_EMITS_NAME) {
            let full_start = search_start + start;
            let macro_end = full_start + DEFINE_EMITS_NAME.len();

            let paren_start = self.find_next_char(macro_end, '(');
            if let Some(paren_start) = paren_start {
                if let Some((_, obj_end)) = self.find_matching_paren(paren_start) {
                    let obj_source = &source[paren_start..=obj_end];
                    let keys = self.extract_object_keys(obj_source);
                    let full_macro_source = source[full_start..=obj_end].to_string();

                    self.has_macros = true;
                    self.emits = Some(EmitsDefinition {
                        source: full_macro_source,
                        events: keys,
                    });

                    self.replacements.push((full_start, obj_end + 1, obj_source.to_string()));
                }
            }

            search_start = macro_end;
        }
    }

    /// Find defineExpose macros
    fn find_define_expose(&mut self) {
        let source = &self.source;
        let mut search_start = 0;

        while let Some(start) = source[search_start..].find(DEFINE_EXPOSE_NAME) {
            let full_start = search_start + start;
            let macro_end = full_start + DEFINE_EXPOSE_NAME.len();

            let paren_start = self.find_next_char(macro_end, '(');
            if let Some(paren_start) = paren_start {
                if let Some((_, obj_end)) = self.find_matching_paren(paren_start) {
                    let obj_source = &source[paren_start..=obj_end];
                    let keys = self.extract_object_keys(obj_source);
                    let full_macro_source = source[full_start..=obj_end].to_string();

                    self.has_macros = true;
                    self.expose = Some(ExposeDefinition {
                        source: full_macro_source,
                        keys,
                    });

                    self.replacements.push((full_start, obj_end + 1, obj_source.to_string()));
                }
            }

            search_start = macro_end;
        }
    }

    /// Find next occurrence of a specific character
    fn find_next_char(&self, start: usize, target: char) -> Option<usize> {
        self.source[start..]
            .find(target)
            .map(|i| start + i)
    }

    /// Find matching parenthesis
    fn find_matching_paren(&self, open_pos: usize) -> Option<(usize, usize)> {
        let mut depth = 0;
        let mut obj_start = None;
        let mut obj_end = None;

        for (i, c) in self.source[open_pos..].char_indices() {
            let pos = open_pos + i;
            match c {
                '{' => {
                    if depth == 0 {
                        obj_start = Some(pos);
                    }
                    depth += 1;
                }
                '}' => {
                    depth -= 1;
                    if depth == 0 {
                        obj_end = Some(pos);
                        break;
                    }
                }
                _ => {}
            }
        }

        match (obj_start, obj_end) {
            (Some(start), Some(end)) => Some((start, end)),
            _ => None,
        }
    }

    /// Extract keys from an object literal string
    /// Simple regex-free implementation
    fn extract_object_keys(&self, obj_str: &str) -> Vec<String> {
        let mut keys = Vec::new();
        let mut chars = obj_str.chars().peekable();
        let mut in_string = false;
        let mut string_char = '"';
        let mut current_key = String::new();

        while let Some(c) = chars.next() {
            if !in_string && (c == '"' || c == '\'') {
                in_string = true;
                string_char = c;
            } else if in_string && c == string_char {
                in_string = false;
            } else if in_string {
                if c == ':' {
                    // Found colon in string - end of key
                    let key = current_key.trim();
                    if !key.is_empty() {
                        keys.push(key.to_string());
                    }
                    current_key.clear();
                } else if c != ' ' || !current_key.is_empty() {
                    current_key.push(c);
                }
            } else if c == ',' {
                current_key.clear();
            } else if c == '}' {
                break;
            }
        }

        keys
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_object_keys() {
        let visitor = MacroVisitor::new("");
        let keys = visitor.extract_object_keys("{ a: 1, b: 2, c: 3 }");
        assert_eq!(keys, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_extract_object_keys_with_strings() {
        let visitor = MacroVisitor::new("");
        let keys = visitor.extract_object_keys(r#"{ "variant": 1, 'size': 2 }"#);
        assert_eq!(keys, vec!["variant", "size"]);
    }
}
