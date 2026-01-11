//! Hydration module for Zeus Compiler SSR
//!
//! This module generates client-side hydration code for SSR components.

/// Hydration code generator
pub struct HydrationGenerator {
    // TODO: Add hydration configuration
}

impl HydrationGenerator {
    /// Create a new hydration generator
    pub fn new() -> Self {
        Self {}
    }

    /// Generate hydration script for a component
    pub fn generate_hydration_script(&self, component_name: &str, mount_point: &str) -> String {
        format!(
            r#"
// Hydration script for {component_name}
import {{ hydrateRoot }} from 'react-dom/client';
import {{ Component }} from './{component_name}';

const container = document.getElementById('{mount_point}');
if (container) {{
  const root = hydrateRoot(container, <Component />);
}}
"#,
            component_name = component_name,
            mount_point = mount_point
        )
    }

    /// Generate hydration script with props
    pub fn generate_hydration_script_with_props(
        &self,
        component_name: &str,
        mount_point: &str,
        props: &serde_json::Value,
    ) -> String {
        format!(
            r#"
// Hydration script for {component_name}
import {{ hydrateRoot }} from 'react-dom/client';
import {{ Component }} from './{component_name}';

const container = document.getElementById('{mount_point}');
const props = {props};
if (container) {{
  const root = hydrateRoot(container, <Component {{...props}} />);
}}
"#,
            component_name = component_name,
            mount_point = mount_point,
            props = props
        )
    }

    /// Generate multiple hydration scripts
    pub fn generate_multiple_hydration_scripts(
        &self,
        components: Vec<(&str, &str, Option<&serde_json::Value>)>,
    ) -> String {
        let mut scripts = Vec::new();

        for (component_name, mount_point, props) in components {
            let script = match props {
                Some(p) => self.generate_hydration_script_with_props(component_name, mount_point, p),
                None => self.generate_hydration_script(component_name, mount_point),
            };
            scripts.push(script);
        }

        scripts.join("\n")
    }
}

impl Default for HydrationGenerator {
    fn default() -> Self {
        Self::new()
    }
}
