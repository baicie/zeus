//! Hydration module for Zeus Compiler SSR
//!
//! Generates client-side hydration scripts that use the Zeus runtime
//! (`@zeus-js/runtime-dom`) to mount SSR-rendered components.

/// Hydration code generator for Zeus components
pub struct HydrationGenerator;

impl HydrationGenerator {
    /// Create a new hydration generator
    pub fn new() -> Self {
        Self
    }

    /// Generate a hydration script that mounts `component_name` onto `mount_point`
    pub fn generate_hydration_script(&self, component_name: &str, mount_point: &str) -> String {
        format!(
            r#"// Hydration script for {component_name}
import {{ createApp }} from '@zeus-js/runtime-dom';
import {{ default as Component }} from './{component_name}';

const container = document.getElementById('{mount_point}');
if (container) {{
  createApp(Component).mount(container);
}}
"#,
            component_name = component_name,
            mount_point = mount_point,
        )
    }

    /// Generate a hydration script that passes serialized props to the component
    pub fn generate_hydration_script_with_props(
        &self,
        component_name: &str,
        mount_point: &str,
        props: &serde_json::Value,
    ) -> String {
        format!(
            r#"// Hydration script for {component_name}
import {{ createApp }} from '@zeus-js/runtime-dom';
import {{ default as Component }} from './{component_name}';

const container = document.getElementById('{mount_point}');
const props = {props};
if (container) {{
  createApp(() => Component(props)).mount(container);
}}
"#,
            component_name = component_name,
            mount_point = mount_point,
            props = props,
        )
    }

    /// Generate hydration scripts for multiple components
    pub fn generate_multiple_hydration_scripts(
        &self,
        components: Vec<(&str, &str, Option<&serde_json::Value>)>,
    ) -> String {
        components
            .into_iter()
            .map(|(component_name, mount_point, props)| match props {
                Some(p) => {
                    self.generate_hydration_script_with_props(component_name, mount_point, p)
                }
                None => self.generate_hydration_script(component_name, mount_point),
            })
            .collect::<Vec<_>>()
            .join("\n")
    }
}

impl Default for HydrationGenerator {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_hydration_script_uses_zeus_api() {
        let generator = HydrationGenerator::new();
        let script = generator.generate_hydration_script("App", "root");
        assert!(script.contains("createApp"), "should use Zeus createApp");
        assert!(
            script.contains("@zeus-js/runtime-dom"),
            "should import from Zeus runtime"
        );
        assert!(!script.contains("react"), "should not reference React");
        assert!(script.contains("root"), "should reference the mount point");
    }

    #[test]
    fn test_hydration_script_with_props() {
        let generator = HydrationGenerator::new();
        let props = serde_json::json!({ "title": "Hello" });
        let script =
            generator.generate_hydration_script_with_props("Header", "header-root", &props);
        assert!(script.contains("createApp"));
        assert!(script.contains("title"));
    }
}
