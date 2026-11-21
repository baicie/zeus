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
use std::sync::OnceLock;

use syn::visit::{self, Visit};

/// Why a `use` path produced no module edge.
#[derive(Debug, PartialEq, Eq)]
pub enum Resolution {
    /// A module in this crate.
    Module(String),
    /// A path outside the crate. Not an error: it carries no boundary.
    External,
    /// A path the checker could not classify. Reported, never dropped.
    Unresolved(&'static str),
    /// A path whose module prefix is decided after the module set is known.
    /// The string is the longest plausible module path, e.g.
    /// `support::html::is_raw_text_element`.
    PrefixCandidates(String),
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
    let mut pending_prefixes: Vec<(String, String, String)> = Vec::new();
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
        analyse_file(
            &root.join(relative),
            relative,
            &mut analysis,
            &mut pending_prefixes,
        );
    }

    // `crate::a::b::c` may end at any of `crate::a`, `crate::a::b`, …: the rest
    // is an item inside that module. The deepest prefix that names a real module
    // is the dependency; if none does, the path is dangling and is reported.
    let known_modules: BTreeSet<String> = analysis.modules.clone();
    for (module, deepest, original) in pending_prefixes {
        let mut candidate = deepest.as_str();
        loop {
            // The walk must not stop at the module that wrote the path. A bare
            // `nowhere::thing` truncates to `nowhere` and then, one step
            // further, to the current module — `a` in `a.rs`. Recording that
            // would turn every dangling import into a self-edge and hide it.
            if candidate != module && known_modules.contains(candidate) {
                analysis
                    .edges
                    .entry(module.clone())
                    .or_default()
                    .insert(candidate.to_string());
                break;
            }
            if candidate == module {
                analysis
                    .unresolved
                    .push(format!("{module}: {original} (no module prefix exists)"));
                break;
            }
            if let Some((prefix, _)) = candidate.rsplit_once("::") {
                candidate = prefix;
            } else {
                analysis
                    .unresolved
                    .push(format!("{module}: {original} (no module prefix exists)"));
                break;
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
/// Module paths used as expressions: `lower::lower_module(..)` and friends.
///
/// Walks with `syn::visit::Visit` rather than a hand-written recursion. The
/// hand-written version covered about a dozen `Expr` variants and silently
/// missed `Binary`, `Assign`, `Array`, `Tuple`, `Struct`, `While`, trait
/// default methods and const/static initialisers — every one of which can
/// contain a qualified call. A visitor inherits the whole AST, so a variant
/// added to `syn` is walked rather than ignored.
///
/// Only `Expr::Path` is collected. A `Type::Path` is not a module call: the
/// type `crate::ir::ModuleIr` says nothing about which module this file
/// depends on at run time, and counting it would create edges for
/// documentation-only mentions.
fn qualified_paths(file: &syn::File) -> Vec<String> {
    let mut visitor = QualifiedPathVisitor::default();
    visitor.visit_file(file);
    let mut out = visitor.paths;
    out.sort();
    out.dedup();
    out
}

#[derive(Default)]
struct QualifiedPathVisitor {
    paths: Vec<String>,
}

impl<'ast> Visit<'ast> for QualifiedPathVisitor {
    fn visit_expr_path(&mut self, node: &'ast syn::ExprPath) {
        if let Some(joined) = join_path(&node.path) {
            self.paths.push(joined);
        }
        // A path expression can still contain sub-paths through generics and
        // const arguments, so keep descending.
        visit::visit_expr_path(self, node);
    }
}

/// `a::b::c` -> `"a::b::c"`, or `None` when the path is not a plain sequence of
/// identifiers (`<T as Trait>::x`).
///
/// A single segment is a local binding or a function in this module, not a
/// module path; only `a::b` and longer can name another module.
fn join_path(path: &syn::Path) -> Option<String> {
    if path.leading_colon.is_some() {
        return None;
    }
    let mut parts = Vec::new();
    for segment in &path.segments {
        if !matches!(segment.arguments, syn::PathArguments::None) {
            return None;
        }
        parts.push(segment.ident.to_string());
    }
    if parts.len() < 2 {
        return None;
    }
    Some(parts.join("::"))
}

/// Whether the path's root can name a module, decided against the crate's real
/// module set rather than a hand-written list.
///
/// An earlier version of this checked a fixed set of module names, which meant
/// a fixture crate (`mod a; mod b;`) never had its qualified paths counted and
/// a synthetic cycle went undetected. A list of names is a list that goes stale;
/// the module set is already known by the time this is called.
fn root_names_a_module(known: &BTreeSet<String>, path: &str) -> bool {
    let Some((root, _)) = path.split_once("::") else {
        return false;
    };
    if matches!(root, "crate" | "super" | "self") {
        return true;
    }
    known.contains(root)
}

/// The edges a file's qualified paths represent.
///
/// Returns the ones that resolve immediately and the ones that need the full
/// module set (a bare root may be a submodule or a crate-level module).
///
/// Only a path whose root is a real module counts. `usize::MAX` and
/// `u32::try_from` are inherent items, and `walk::visit_x` names an item
/// brought in by `use` — counting those would give every file edges to nothing.
/// One file's declarations, `use` edges and qualified-path edges.
fn analyse_file(
    absolute: &Path,
    relative: &Path,
    analysis: &mut Analysis,
    pending_prefixes: &mut Vec<(String, String, String)>,
) {
    let module = module_path_of(relative);
    let source = fs::read_to_string(absolute).expect("readable source file");
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
                        Resolution::PrefixCandidates(deepest) => {
                            pending_prefixes.push((module.clone(), deepest, path));
                        }
                        Resolution::Unresolved(reason) => analysis
                            .unresolved
                            .push(format!("{module}: {path} ({reason})")),
                    }
                }
            }
            _ => {}
        }
    }

    // A qualified path is a dependency the `use` scan cannot see, and a call
    // through one was how a real cycle stayed invisible.
    for target in qualified_edges(&file, &module, &analysis.modules) {
        analysis
            .edges
            .entry(module.clone())
            .or_default()
            .insert(target);
    }
}

fn qualified_edges(file: &syn::File, module: &str, known: &BTreeSet<String>) -> Vec<String> {
    let mut direct = Vec::new();
    for path in qualified_paths(file) {
        if let Some(target) = resolve_qualified(module, &path, known)
            && target != module
        {
            direct.push(target);
        }
    }
    direct
}

/// Resolves a qualified path used as an expression to the module it names.
///
/// Rust resolves the first segment of a bare path against the current module
/// first, then the crate root. `b::work()` inside `a` is `a::b` when that
/// module exists, and `crate::b` when it does not. Only the real module set can
/// tell, so every candidate prefix is tried and the deepest one that exists
/// wins.
///
/// `None` means the path names no module — `usize::MAX`, a `use` alias, a local
/// binding. Those are not edges, and they are not errors either: an expression
/// path is not a declaration, so there is nothing to report.
fn resolve_qualified(module: &str, path: &str, known: &BTreeSet<String>) -> Option<String> {
    for (base, rest) in path_bases(module, path) {
        if let Some(found) = deepest_known_module(&base, &rest, known) {
            // Truncating `a::b::work` back to `a` — the module we are already
            // in — means the path names something inside this module, not a
            // dependency on it. A self-edge says nothing about the graph, and
            // returning it would stop the search before the crate-root
            // candidate (`b`) is tried.
            if found == module {
                continue;
            }
            return Some(found);
        }
    }
    None
}

/// The candidate module bases for a path, in Rust's lookup order.
fn path_bases(module: &str, path: &str) -> Vec<(String, String)> {
    let mut segments = path.split("::");
    let Some(root) = segments.next() else {
        return Vec::new();
    };
    match root {
        "crate" => vec![(String::new(), segments.collect::<Vec<_>>().join("::"))],
        "super" => {
            let mut base = super_of(module);
            let mut rest: Vec<&str> = segments.collect();
            while rest.first() == Some(&"super") {
                rest.remove(0);
                base = super_of(&base);
            }
            // At the crate root the base is the empty prefix, not the literal
            // module name `lib`: `lib` is how the checker *labels* the root, and
            // joining it produces `lib::root`, which matches `lib` on the way
            // back down and reports a dependency on the crate root instead of
            // on `root`.
            if base == "lib" {
                base.clear();
            }
            vec![(base, rest.join("::"))]
        }
        "self" => vec![(module.to_string(), segments.collect::<Vec<_>>().join("::"))],
        _ => vec![
            // The current module and its ancestors, nearest first.
            (module.to_string(), path.to_string()),
            // Then the crate root.
            (String::new(), path.to_string()),
        ],
    }
}

/// The longest prefix of `base::rest` that names a real module.
fn deepest_known_module(base: &str, rest: &str, known: &BTreeSet<String>) -> Option<String> {
    let joined = if base.is_empty() {
        rest.to_string()
    } else if rest.is_empty() {
        base.to_string()
    } else {
        format!("{base}::{rest}")
    };
    if joined.is_empty() {
        return None;
    }
    let mut candidate = joined.as_str();
    loop {
        if known.contains(candidate) {
            return Some(candidate.to_string());
        }
        match candidate.rsplit_once("::") {
            Some((prefix, _)) => candidate = prefix,
            None => return None,
        }
    }
}

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
/// Dependency names as declared in the crate's own `Cargo.toml`.
///
/// This used to be a hand-written list. A list is a snapshot: adding a
/// dependency and forgetting the list makes the checker resolve `newdep::foo`
/// as a sibling module and report "no such module" — or, worse, match a local
/// module of the same name and invent an edge. Reading the manifest means the
/// answer comes from the same file that decides it for the compiler.
fn external_crates() -> &'static BTreeSet<String> {
    static CACHE: OnceLock<BTreeSet<String>> = OnceLock::new();
    CACHE.get_or_init(|| {
        let manifest = Path::new(env!("CARGO_MANIFEST_DIR")).join("Cargo.toml");
        // `env!` guarantees the directory exists; a missing manifest would mean
        // the crate was never in this shape, and the whole checker is then
        // meaningless.
        let text = fs::read_to_string(&manifest).expect("read the crate manifest");
        let mut names: BTreeSet<String> = ["std", "alloc", "core", "crate", "self", "super"]
            .into_iter()
            .map(ToString::to_string)
            .collect();
        // Dependencies appear as `name.workspace = true` or `name = "…"` under
        // `[dependencies]`; a line-oriented read is enough because the manifest
        // is ours and the shape is checked by Cargo.
        let mut in_dependencies = false;
        for line in text.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with('[') {
                in_dependencies = trimmed == "[dependencies]"
                    || trimmed == "[dev-dependencies]"
                    || trimmed == "[build-dependencies]";
                continue;
            }
            if !in_dependencies || trimmed.is_empty() || trimmed.starts_with('#') {
                continue;
            }
            if let Some((name, _)) = trimmed.split_once(['=', '.']) {
                let name = name.trim();
                if !name.is_empty() {
                    // Cargo package names may contain `-`; Rust paths use `_`.
                    names.insert(name.replace('-', "_"));
                }
            }
        }
        names
    })
}

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
                // `crate::codegen::infra::name` names the *deepest module* on
                // the path, not the first segment. Stopping at `codegen` would
                // report an import of the emitter when the code imports a leaf
                // module under it — the difference between a cycle and a clean
                // dependency. The deepest module is decided against the module
                // set after parsing (see `resolve_prefixes`), because only then
                // is it known where the module path ends and the item begins.
                other => {
                    let mut deepest = other.to_string();
                    for segment in parts {
                        if segment
                            .chars()
                            .next()
                            .is_some_and(|c| c.is_ascii_uppercase())
                        {
                            break;
                        }
                        deepest = format!("{deepest}::{segment}");
                    }
                    return Resolution::PrefixCandidates(deepest);
                }
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
        root if external_crates().contains(root) => return Resolution::External,
        // A bare lowercase root names a sibling module — or, from the crate
        // root, a top-level module. This is the branch the text scanner got
        // wrong: `ssr` in `codegen/mod.rs` is `codegen::ssr`.
        root if root.chars().next().is_some_and(|c| c.is_ascii_lowercase()) => {
            // A bare root names a module under the current one (`ssr` in
            // `codegen/mod.rs` is `codegen::ssr`), and the remaining lowercase
            // segments narrow it further (`dom::emit` is `codegen::dom::emit`).
            //
            // `resolve_use` has no module set, so it cannot know which prefix
            // exists. It returns the deepest candidate and lets the caller's
            // prefix walk find the longest real module — the same mechanism
            // `crate::` already uses. Reporting only `codegen::dom` for
            // `dom::emit::emit_component` is what let a cycle through
            // `dom::emit` stay invisible.
            let mut deepest = join_module(module, root);
            for segment in parts {
                if segment
                    .chars()
                    .next()
                    .is_some_and(|c| c.is_ascii_uppercase())
                {
                    break;
                }
                deepest = format!("{deepest}::{segment}");
            }
            return Resolution::PrefixCandidates(deepest);
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
            Resolution::PrefixCandidates(m) if m == "codegen::ssr::emit_ssr_module"
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
        // `ir` is a module and `ModuleIr` is an item in it; the path resolves
        // to the module.
        assert!(matches!(
            resolve_use("lower", "crate::ir::ModuleIr"),
            Resolution::PrefixCandidates(p) if p == "ir"
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
    fn a_bare_root_defers_the_deepest_module_to_the_prefix_walk() {
        // `resolve_use` cannot know which prefix exists, so it hands the full
        // candidate to the caller, including the item name. The prefix walk
        // then truncates to the longest real module: `dom::emit::emit_component`
        // becomes `codegen::dom::emit`, not `codegen::dom`.
        //
        // Returning only the first segment — the previous behaviour — is what
        // hid a cycle that ran through `dom::emit`.
        assert!(matches!(
            resolve_use("codegen", "ssr::emit_ssr_module"),
            Resolution::PrefixCandidates(m) if m == "codegen::ssr::emit_ssr_module"
        ));
        assert!(matches!(
            resolve_use("codegen", "dom::emit::emit_component"),
            Resolution::PrefixCandidates(m) if m == "codegen::dom::emit::emit_component"
        ));
        // A CamelCase segment ends the module path.
        assert!(matches!(
            resolve_use("codegen", "analysis::RuntimeHelper"),
            Resolution::PrefixCandidates(m) if m == "codegen::analysis"
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
