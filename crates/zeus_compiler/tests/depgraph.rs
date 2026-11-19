//! Module dependency analysis by parsing Rust syntax.
//!
//! A test-support module: it reads a crate's source and answers the two
//! questions the boundary tests ask — which modules a file imports, and which
//! modules it declares.
//!
//! It parses with `syn` rather than scanning text. The scanner it replaces
//! resolved `pub(crate) use ssr::{…}` inside `codegen/mod.rs` to the bare name
//! `ssr` instead of `codegen::ssr`; the cycle finder then skipped the edge
//! because no module called `ssr` existed. That silently hid the real
//! `codegen -> codegen::ssr -> codegen` cycle, so the text version reported a
//! clean graph on a tree that had one.
//!
//! Two rules keep the same class of mistake from returning:
//!
//! 1. **Resolve every path to a full module path.** `use` paths, `super::`,
//!    `self::`, `crate::` and bare sibling names are normalised against the
//!    importing module before anything is compared.
//! 2. **Fail closed.** A `use` whose root cannot be classified, and an edge that
//!    names a module which does not exist, both land in [`Analysis::unresolved`].
//!    Every test asserts that list is empty, so an unparsed edge cannot look
//!    like an absent one.

#![allow(dead_code)]

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

/// Why a `use` path produced no module edge.
#[derive(Debug, PartialEq, Eq)]
pub enum Resolution {
    /// A module in this crate.
    Module(String),
    /// A path outside the crate. Not an error: it carries no boundary.
    External,
    /// A path the checker could not classify. Reported, never dropped.
    Unresolved(&'static str),
}

/// A parsed crate.
#[derive(Debug, Default)]
pub struct Analysis {
    /// Module path -> modules it imports (implementation dependency).
    pub edges: BTreeMap<String, BTreeSet<String>>,
    /// Module path -> child modules declared with `mod name;`.
    pub declarations: BTreeMap<String, BTreeSet<String>>,
    /// Imports that could not be resolved, or that name a module which does not
    /// exist. Never expected to be non-empty by accident.
    pub unresolved: Vec<String>,
    /// Modules that exist as files.
    pub modules: BTreeSet<String>,
}

impl Analysis {
    /// Imports of one module.
    #[must_use]
    pub fn imports_of(&self, module: &str) -> BTreeSet<String> {
        self.edges.get(module).cloned().unwrap_or_default()
    }

    /// Whether `from` imports `to`.
    #[must_use]
    pub fn imports(&self, from: &str, to: &str) -> bool {
        self.edges.get(from).is_some_and(|set| set.contains(to))
    }

    /// The first import cycle found, as a closed path of module names.
    #[must_use]
    pub fn first_cycle(&self) -> Option<Vec<String>> {
        let mut done: BTreeSet<String> = BTreeSet::new();
        for module in self.edges.keys() {
            let mut visiting = BTreeSet::new();
            let mut trail = Vec::new();
            if let Some(cycle) = self.walk(module, &mut visiting, &mut done, &mut trail) {
                return Some(cycle);
            }
        }
        None
    }

    fn walk(
        &self,
        module: &str,
        visiting: &mut BTreeSet<String>,
        done: &mut BTreeSet<String>,
        trail: &mut Vec<String>,
    ) -> Option<Vec<String>> {
        if done.contains(module) {
            return None;
        }
        if !visiting.insert(module.to_string()) {
            let start = trail.iter().position(|entry| entry == module).unwrap_or(0);
            let mut cycle = trail[start..].to_vec();
            cycle.push(module.to_string());
            return Some(cycle);
        }
        trail.push(module.to_string());
        if let Some(imports) = self.edges.get(module) {
            for import in imports {
                if self.edges.contains_key(import)
                    && let Some(cycle) = self.walk(import, visiting, done, trail)
                {
                    return Some(cycle);
                }
            }
        }
        trail.pop();
        visiting.remove(module);
        done.insert(module.to_string());
        None
    }

    /// Modules not reachable from the crate root through imports or `mod`.
    #[must_use]
    pub fn unreachable(&self) -> Vec<String> {
        let mut seen: BTreeSet<String> = BTreeSet::new();
        let mut stack = vec!["lib".to_string()];
        while let Some(module) = stack.pop() {
            if !seen.insert(module.clone()) {
                continue;
            }
            for next in self.imports_of(&module) {
                stack.push(next);
            }
            if let Some(children) = self.declarations.get(&module) {
                for child in children {
                    stack.push(child.clone());
                }
            }
        }
        self.modules
            .iter()
            .filter(|module| !seen.contains(*module))
            .cloned()
            .collect()
    }
}

/// Parses every `.rs` file under `root` (a crate's `src/` directory).
///
/// # Panics
///
/// Panics when a file is not valid Rust. A boundary check that silently skipped
/// an unparsable file would report a cleaner graph than the code has.
#[must_use]
pub fn analyse(root: &Path) -> Analysis {
    let mut analysis = Analysis::default();
    let files = rust_files(root);
    if files.is_empty() {
        return analysis;
    }

    for relative in &files {
        let module = module_path_of(relative);
        analysis.modules.insert(module.clone());
        analysis.edges.entry(module.clone()).or_default();
        analysis.declarations.entry(module.clone()).or_default();
    }

    for relative in &files {
        let module = module_path_of(relative);
        let source = fs::read_to_string(root.join(relative)).expect("readable source file");
        let file = syn::parse_file(&source).unwrap_or_else(|error| {
            panic!(
                "{} is not valid Rust and could not be analysed: {error}",
                relative.display()
            )
        });

        for item in &file.items {
            match item {
                // `mod foo;` declares a child; `mod foo { … }` is inline and has
                // no file, so it is not a module edge.
                syn::Item::Mod(item_mod) if item_mod.content.is_none() => {
                    let child = join_module(&module, &item_mod.ident.to_string());
                    analysis
                        .declarations
                        .entry(module.clone())
                        .or_default()
                        .insert(child);
                }
                syn::Item::Use(item_use) => {
                    let mut paths = Vec::new();
                    expand_use_tree(&item_use.tree, &mut Vec::new(), &mut paths);
                    for path in paths {
                        match resolve_use(&module, &path) {
                            Resolution::Module(target) => {
                                analysis
                                    .edges
                                    .entry(module.clone())
                                    .or_default()
                                    .insert(target);
                            }
                            Resolution::External => {}
                            Resolution::Unresolved(reason) => analysis
                                .unresolved
                                .push(format!("{module}: {path} ({reason})")),
                        }
                    }
                }
                _ => {}
            }
        }
    }

    // Fail closed on a second axis: an edge naming a module that does not exist
    // is a resolver mistake or a moved file. Keeping it would make the edge
    // invisible to `first_cycle`, which filters by `contains_key`.
    let known: BTreeSet<String> = analysis.modules.clone();
    let mut dangling = Vec::new();
    for (module, imports) in &mut analysis.edges {
        let mut kept = BTreeSet::new();
        for import in imports.iter() {
            if known.contains(import) || import == "lib" {
                kept.insert(import.clone());
            } else {
                dangling.push(format!("{module} -> {import} (no such module)"));
            }
        }
        *imports = kept;
    }
    analysis.unresolved.extend(dangling);

    analysis
}

/// Modules of a crate that are `prefix` or below it.
#[must_use]
pub fn modules_under(analysis: &Analysis, prefix: &str) -> Vec<String> {
    analysis
        .modules
        .iter()
        .filter(|module| *module == prefix || module.starts_with(&format!("{prefix}::")))
        .cloned()
        .collect()
}

fn rust_files(root: &Path) -> Vec<PathBuf> {
    fn walk(dir: &Path, base: &Path, out: &mut Vec<PathBuf>) {
        let Ok(entries) = fs::read_dir(dir) else {
            return;
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                walk(&path, base, out);
            } else if path.extension().is_some_and(|ext| ext == "rs") {
                out.push(path.strip_prefix(base).expect("inside root").to_path_buf());
            }
        }
    }
    let mut files = Vec::new();
    walk(root, root, &mut files);
    files.sort();
    files
}

/// `codegen/ssr.rs` -> `codegen::ssr`; `codegen/mod.rs` -> `codegen`;
/// `lib.rs` -> `lib`.
fn module_path_of(relative: &Path) -> String {
    let mut parts: Vec<String> = relative
        .components()
        .map(|component| component.as_os_str().to_string_lossy().to_string())
        .collect();
    if let Some(last) = parts.last_mut() {
        *last = last.trim_end_matches(".rs").to_string();
    }
    if parts.last().is_some_and(|last| last == "mod") {
        parts.pop();
    }
    parts.join("::")
}

/// The crate root is spelled `lib`, so a child of it is the bare name.
fn join_module(parent: &str, child: &str) -> String {
    if parent == "lib" {
        child.to_string()
    } else {
        format!("{parent}::{child}")
    }
}

fn parent_of(module: &str) -> Option<&str> {
    module.rsplit_once("::").map(|(parent, _)| parent)
}

/// The module `super` names from `module`.
fn super_of(module: &str) -> String {
    parent_of(module).map_or_else(|| "lib".to_string(), ToString::to_string)
}

/// Flattens a `use` tree into full paths, keeping the original path when an
/// import is renamed so `use x::Y as Z` still records `x::Y`.
fn expand_use_tree(tree: &syn::UseTree, prefix: &mut Vec<String>, out: &mut Vec<String>) {
    match tree {
        syn::UseTree::Path(path) => {
            prefix.push(path.ident.to_string());
            expand_use_tree(&path.tree, prefix, out);
            prefix.pop();
        }
        syn::UseTree::Name(name) => {
            let mut parts = prefix.clone();
            parts.push(name.ident.to_string());
            out.push(parts.join("::"));
        }
        syn::UseTree::Rename(rename) => {
            let mut parts = prefix.clone();
            parts.push(rename.ident.to_string());
            out.push(parts.join("::"));
        }
        syn::UseTree::Glob(_) => {
            let mut parts = prefix.clone();
            parts.push("*".to_string());
            out.push(parts.join("::"));
        }
        syn::UseTree::Group(group) => {
            for item in &group.items {
                expand_use_tree(item, prefix, out);
            }
        }
    }
}

/// Crates imported by `zeus_compiler`, in `use` form.
///
/// Kept explicit so a lowercase root is never mistaken for a sibling module.
/// A crate added to `Cargo.toml` must be added here: guessing risks inventing an
/// edge onto a real module name.
const EXTERNAL_CRATES: &[&str] = &[
    "alloc",
    "core",
    "oxc_allocator",
    "oxc_ast",
    "oxc_ast_visit",
    "oxc_diagnostics",
    "oxc_parser",
    "oxc_semantic",
    "oxc_sourcemap",
    "oxc_span",
    "oxc_syntax",
    "serde",
    "serde_json",
    "std",
];

/// Resolves one `use` path to the module it names.
fn resolve_use(module: &str, path: &str) -> Resolution {
    let mut parts = path.split("::");
    let Some(root) = parts.next() else {
        return Resolution::Unresolved("empty use path");
    };

    // The first segment decides the base module; the rest names a member of it
    // and does not change which module is depended on.
    let base = match root {
        "crate" => {
            let Some(first) = parts.next() else {
                return Resolution::Unresolved("`crate::` with no member");
            };
            match first {
                // Re-exports of support modules: resolve to where the code is.
                "span" | "diagnostic" => format!("support::{first}"),
                // `crate::TransformModuleResult` names an item in `lib.rs`, not
                // a module. A lowercase name is a module; CamelCase is an item.
                other if other.chars().next().is_some_and(|c| c.is_ascii_uppercase()) => {
                    return Resolution::External;
                }
                other => other.to_string(),
            }
        }
        "super" => {
            let mut current = super_of(module);
            let mut rest = parts.clone();
            while rest
                .clone()
                .next()
                .is_some_and(|segment| segment == "super")
            {
                rest.next();
                current = super_of(&current);
            }
            current
        }
        "self" => module.to_string(),
        root if root.chars().next().is_some_and(char::is_uppercase) => return Resolution::External,
        root if EXTERNAL_CRATES.contains(&root) => return Resolution::External,
        // A bare lowercase root names a sibling module — or, from the crate
        // root, a top-level module. This is the branch the text scanner got
        // wrong: `ssr` in `codegen/mod.rs` is `codegen::ssr`.
        root if root.chars().next().is_some_and(|c| c.is_ascii_lowercase()) => {
            join_module(module, root)
        }
        _ => return Resolution::Unresolved("unrecognised use root"),
    };

    Resolution::Module(base)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sibling_import_from_a_mod_file_resolves_to_the_full_path() {
        assert!(matches!(
            resolve_use("codegen", "ssr::emit_ssr_module"),
            Resolution::Module(m) if m == "codegen::ssr"
        ));
    }

    #[test]
    fn super_from_a_child_resolves_to_the_parent() {
        assert!(matches!(
            resolve_use("codegen::ssr", "super"),
            Resolution::Module(m) if m == "codegen"
        ));
        assert!(matches!(
            resolve_use("codegen::ssr", "super::CodeWriter"),
            Resolution::Module(m) if m == "codegen"
        ));
    }

    #[test]
    fn super_from_a_top_level_module_resolves_to_the_root() {
        assert!(matches!(
            resolve_use("codegen", "super::x"),
            Resolution::Module(m) if m == "lib"
        ));
    }

    #[test]
    fn crate_paths_resolve_through_the_alias_to_support() {
        assert!(matches!(
            resolve_use("lower", "crate::span::SourceSpan"),
            Resolution::Module(m) if m == "support::span"
        ));
        assert!(matches!(
            resolve_use("lower", "crate::ir::ModuleIr"),
            Resolution::Module(m) if m == "ir"
        ));
    }

    #[test]
    fn a_crate_path_to_an_item_is_not_a_module() {
        assert_eq!(
            resolve_use("codegen::ssr", "crate::TransformModuleResult"),
            Resolution::External
        );
    }

    #[test]
    fn self_paths_resolve_to_the_module_itself() {
        assert!(matches!(
            resolve_use("codegen", "self::analysis"),
            Resolution::Module(m) if m == "codegen"
        ));
    }

    #[test]
    fn lowercase_roots_are_siblings() {
        assert!(matches!(
            resolve_use("codegen", "analysis::RuntimeHelper"),
            Resolution::Module(m) if m == "codegen::analysis"
        ));
        assert!(matches!(
            resolve_use("lib", "support::diagnostic"),
            Resolution::Module(m) if m == "support"
        ));
    }

    #[test]
    fn external_crates_are_not_edges_and_not_errors() {
        assert_eq!(
            resolve_use("ir", "std::collections::HashMap"),
            Resolution::External
        );
        assert_eq!(resolve_use("ir", "serde::Serialize"), Resolution::External);
        assert_eq!(
            resolve_use("support::hmr", "oxc_parser::Parser"),
            Resolution::External
        );
    }

    #[test]
    fn use_groups_are_flattened() {
        let file: syn::File =
            syn::parse_str("use crate::{ir::ModuleIr, span::SourceSpan};").unwrap();
        let syn::Item::Use(item) = &file.items[0] else {
            panic!("expected a use item");
        };
        let mut paths = Vec::new();
        expand_use_tree(&item.tree, &mut Vec::new(), &mut paths);
        assert_eq!(
            paths,
            vec!["crate::ir::ModuleIr", "crate::span::SourceSpan"]
        );
    }

    #[test]
    fn renamed_imports_keep_the_original_path() {
        let file: syn::File = syn::parse_str("use crate::ir::ModuleIr as Ir;").unwrap();
        let syn::Item::Use(item) = &file.items[0] else {
            panic!("expected a use item");
        };
        let mut paths = Vec::new();
        expand_use_tree(&item.tree, &mut Vec::new(), &mut paths);
        assert_eq!(paths, vec!["crate::ir::ModuleIr"]);
    }

    #[test]
    fn nested_groups_are_flattened() {
        let file: syn::File =
            syn::parse_str("use crate::{ir::{ModuleIr, NodeId}, span::SourceSpan};").unwrap();
        let syn::Item::Use(item) = &file.items[0] else {
            panic!("expected a use item");
        };
        let mut paths = Vec::new();
        expand_use_tree(&item.tree, &mut Vec::new(), &mut paths);
        assert!(
            paths.contains(&"crate::ir::ModuleIr".to_string()),
            "{paths:?}"
        );
        assert!(
            paths.contains(&"crate::ir::NodeId".to_string()),
            "{paths:?}"
        );
        assert!(
            paths.contains(&"crate::span::SourceSpan".to_string()),
            "{paths:?}"
        );
    }
}
