//! Module dependency boundaries, enforced by reading the source.
//!
//! The layering this crate states — `support` is leaf-level, `analysis` reads
//! the IR and never emits, `codegen` depends on analysis one way — was broken
//! twice before it was noticed: `codegen/analysis.rs` imported `super::` to
//! reach a helper defined beside the emitter, and `support/hmr.rs` and
//! `support/hydration.rs` grew IR traversal inside a layer documented as
//! knowing nothing about the IR.
//!
//! A doc comment cannot fail a build, so the boundary is checked here instead.
//! The check is textual on purpose: it reads `use` statements, which is what
//! the compiler itself resolves, and it needs no build of the crate to run.
//! `cargo test` runs it with the other integration tests.
//!
//! Two import styles exist in this crate and both are counted:
//!
//! ```text
//! use crate::support::span::SourceSpan;         // explicit path
//! use crate::{span::SourceSpan, ir::ModuleIr};  // via the lib.rs alias
//! ```
//!
//! Missing the alias form is what let a naive scan under-count edges, so the
//! parser below normalises both before deciding anything.

use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::{Path, PathBuf};

fn src_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
}

/// Every `.rs` file under `src/`, relative to `src/`.
fn source_files() -> Vec<PathBuf> {
    fn walk(dir: &Path, base: &Path, out: &mut Vec<PathBuf>) {
        for entry in fs::read_dir(dir).expect("read module directory") {
            let entry = entry.expect("read directory entry");
            let path = entry.path();
            if path.is_dir() {
                walk(&path, base, out);
            } else if path.extension().is_some_and(|ext| ext == "rs") {
                out.push(path.strip_prefix(base).expect("inside src").to_path_buf());
            }
        }
    }
    let root = src_root();
    let mut files = Vec::new();
    walk(&root, &root, &mut files);
    files.sort();
    files
}

/// A module's dotted name, e.g. `codegen/analysis.rs` -> `codegen::analysis`.
fn module_name(file: &Path) -> String {
    let mut parts: Vec<String> = file
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

/// The crate-internal modules a file imports.
///
/// Returns dotted names of the *crate* modules it reaches (`support::hmr`,
/// `codegen`, `ir`), not the individual items.
fn crate_imports(source: &str) -> BTreeSet<String> {
    let mut out = BTreeSet::new();
    let statements = collect_statements(source);

    for statement in statements {
        if let Some(rest) = statement
            .strip_prefix("pub(crate) use ")
            .or_else(|| statement.strip_prefix("pub use "))
            .or_else(|| statement.strip_prefix("use "))
        {
            for segment in split_use_tree(rest) {
                let trimmed = segment.trim().trim_start_matches("pub ");
                if let Some(path) = trimmed.strip_prefix("crate::") {
                    if let Some(module) = first_module_of_crate_path(path) {
                        out.insert(module);
                    }
                } else if trimmed.starts_with("super::") {
                    out.insert("__super__".to_string());
                } else {
                    // A bare path names a sibling module: `use analysis::foo`
                    // inside `codegen/mod.rs` is `codegen::analysis`. The leaf
                    // splitter strips the shared prefix, so recover it from the
                    // statement itself.
                    let head = statement
                        .rsplit_once("use ")
                        .map_or("", |(_, rest)| rest)
                        .trim()
                        .split("::")
                        .next()
                        .unwrap_or("")
                        .trim();
                    if !head.is_empty()
                        && head.chars().next().is_some_and(|c| c.is_ascii_lowercase())
                        && !head.contains(':')
                    {
                        out.insert(format!("__sibling__{head}"));
                    }
                }
            }
            continue;
        }

        // `mod foo;` declares a child module. Since modules are files here, the
        // declaration *is* the edge from parent to child, and without it every
        // file except lib.rs looks unreachable.
        for prefix in ["mod ", "pub mod ", "pub(crate) mod "] {
            if let Some(name) = statement.strip_prefix(prefix) {
                let name = name.trim_end_matches(';').trim();
                if !name.contains('{') && !name.is_empty() {
                    out.insert(format!("__child__{name}"));
                }
                break;
            }
        }
    }
    out
}

/// Joins each top-level statement across lines: a `use` tree may wrap.
fn collect_statements(source: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current = String::new();
    for raw in source.lines() {
        let line = raw.trim();
        if line.starts_with("//") || line.starts_with('*') || line.starts_with("/*") {
            continue;
        }
        if current.is_empty()
            && !(line.starts_with("use ")
                || line.starts_with("pub use ")
                || line.starts_with("pub(crate) use ")
                || line.starts_with("mod ")
                || line.starts_with("pub mod ")
                || line.starts_with("pub(crate) mod "))
        {
            continue;
        }
        current.push(' ');
        current.push_str(line);
        if current.trim_end().ends_with(';') {
            statements.push(current.trim().to_string());
            current.clear();
        }
    }
    statements
}

/// Splits a `use` tree into its leaf paths.
///
/// `{a::b, c::{d, e}}` becomes `a::b`, `c::d` and `c::e`.
fn split_use_tree(tree: &str) -> Vec<String> {
    let tree = tree.trim_end_matches(';').trim();
    let mut paths = Vec::new();
    let mut prefix = String::new();
    let mut depth = 0usize;
    let mut current = String::new();

    for ch in tree.chars() {
        match ch {
            '{' => {
                depth += 1;
                if depth == 1 {
                    prefix = current.trim_end_matches("::").to_string();
                    current.clear();
                } else {
                    current.push(ch);
                }
            }
            '}' => {
                depth -= 1;
                if depth == 0 {
                    for part in split_top_level(&current) {
                        let joined = if prefix.is_empty() {
                            part
                        } else {
                            format!("{prefix}::{part}")
                        };
                        paths.push(joined);
                    }
                    current.clear();
                    prefix.clear();
                } else {
                    current.push(ch);
                }
            }
            ',' if depth <= 1 => {
                if depth == 0 {
                    if !current.trim().is_empty() {
                        paths.push(current.trim().to_string());
                    }
                    current.clear();
                } else {
                    current.push(ch);
                }
            }
            _ => current.push(ch),
        }
    }
    if !current.trim().is_empty() {
        paths.push(current.trim().to_string());
    }
    // Drop `self` leaves produced by `path::{self, item}` -> the path itself.
    paths
        .into_iter()
        .map(|path| path.trim_end_matches("::self").trim().to_string())
        .filter(|path| !path.is_empty())
        .collect()
}

fn split_top_level(value: &str) -> Vec<String> {
    let mut parts = Vec::new();
    let mut depth = 0usize;
    let mut current = String::new();
    for ch in value.chars() {
        match ch {
            '{' => {
                depth += 1;
                current.push(ch);
            }
            '}' => {
                depth -= 1;
                current.push(ch);
            }
            ',' if depth == 0 => {
                let item = current.trim().to_string();
                if !item.is_empty() {
                    parts.push(item);
                }
                current.clear();
            }
            _ => current.push(ch),
        }
    }
    let item = current.trim().to_string();
    if !item.is_empty() {
        parts.push(item);
    }
    parts
}

/// The crate module a `crate::<here>` path names, normalising the aliases
/// `lib.rs` re-exports (`crate::span` -> `support::span`).
fn first_module_of_crate_path(path: &str) -> Option<String> {
    let first = path.split("::").next()?.trim();
    let normalised = match first {
        "span" | "diagnostic" => format!("support::{first}"),
        other => other.to_string(),
    };
    Some(normalised)
}

/// Builds `module -> modules it imports`.
fn import_graph() -> BTreeMap<String, BTreeSet<String>> {
    let root = src_root();
    let mut graph = BTreeMap::new();
    for file in source_files() {
        let name = module_name(&file);
        let source = fs::read_to_string(root.join(&file)).expect("read source");
        graph.insert(name, crate_imports(&source));
    }
    graph
}

fn parent_of(module: &str) -> Option<&str> {
    module.rsplit_once("::").map(|(parent, _)| parent)
}

/// Resolves `__super__` to the module's parent.
/// Module-to-module *import* edges only. `mod` declarations are returned
/// separately by [`child_modules`] because they express containment, not
/// dependency.
fn resolved(graph: &BTreeMap<String, BTreeSet<String>>) -> BTreeMap<String, BTreeSet<String>> {
    let mut out = BTreeMap::new();
    let mut declarations = BTreeSet::new();
    for (module, imports) in graph {
        let mut resolved_imports = BTreeSet::new();
        for import in imports {
            if import == "__super__" {
                if let Some(parent) = parent_of(module) {
                    // `super::x` names an item in the parent module itself.
                    resolved_imports.insert(parent.to_string());
                }
            } else if let Some(sibling) = import.strip_prefix("__sibling__") {
                // Siblings live under the same parent; a top-level module such
                // as `codegen` has the crate root as its parent.
                let qualified = match parent_of(module) {
                    Some(parent) if module != "lib" => format!("{parent}::{sibling}"),
                    _ => sibling.to_string(),
                };
                resolved_imports.insert(qualified);
            } else if let Some(child) = import.strip_prefix("__child__") {
                // A `mod` declaration says the child module *exists*; it is not
                // a dependency the child's code depends on. Only the reachability
                // check uses it, so it is recorded separately rather than as an
                // import edge — otherwise every parent/child pair looks cyclic.
                let qualified = if module == "lib" {
                    child.to_string()
                } else {
                    format!("{module}::{child}")
                };
                declarations.insert(qualified);
            } else {
                resolved_imports.insert(import.clone());
            }
        }
        out.insert(module.clone(), resolved_imports);
    }
    let _ = declarations;
    out
}

/// Parent -> child module containment, from `mod` declarations.
fn child_modules() -> BTreeMap<String, BTreeSet<String>> {
    let root = src_root();
    let mut out: BTreeMap<String, BTreeSet<String>> = BTreeMap::new();
    for file in source_files() {
        let name = module_name(&file);
        let source = fs::read_to_string(root.join(&file)).expect("read source");
        let mut children = BTreeSet::new();
        for statement in collect_statements(&source) {
            for prefix in ["mod ", "pub mod ", "pub(crate) mod "] {
                if let Some(child) = statement.strip_prefix(prefix) {
                    let child = child.trim_end_matches(';').trim();
                    if !child.contains('{') && !child.is_empty() {
                        children.insert(if name == "lib" {
                            child.to_string()
                        } else {
                            format!("{name}::{child}")
                        });
                    }
                    break;
                }
            }
        }
        out.insert(name, children);
    }
    out
}

#[test]
fn support_is_a_leaf_layer() {
    // `support` was documented as knowing nothing about the IR, and two of its
    // modules grew full IR traversal anyway. The rule that survives contact
    // with the code is narrower and true: `support` may use the IR *types*, and
    // the two modules that walk them must be listed here by name so that
    // moving them is a decision rather than an accident.
    const MAY_TRAVERSE_IR: &[&str] = &[
        // HMR rewrites the IR into a signature; it is a pass, not support.
        "support::hmr",
        // Hydration derives a plan from the IR; it is analysis, not support.
        "support::hydration",
    ];

    let graph = resolved(&import_graph());
    let mut offenders = Vec::new();

    for (module, imports) in &graph {
        if !module.starts_with("support") {
            continue;
        }
        for import in imports {
            // A support module must never depend on a stage above it.
            let upward = import.starts_with("codegen")
                || import.starts_with("lower")
                || import.starts_with("ssr");
            if upward {
                offenders.push(format!("{module} imports {import}"));
            }
        }
    }

    assert!(
        offenders.is_empty(),
        "support is a leaf layer and must not depend on a stage:\n  {}",
        offenders.join("\n  ")
    );

    // Named exceptions stay visible: if a module is added to this list the
    // reader sees a conscious exception, not an unnoticed dependency.
    let traversal: Vec<&String> = graph
        .iter()
        .filter(|(module, imports)| {
            module.starts_with("support")
                && imports.contains("ir")
                && !MAY_TRAVERSE_IR.contains(&module.as_str())
        })
        .map(|(module, _)| module)
        .collect();
    assert!(
        traversal.is_empty(),
        "these support modules read the IR without being listed as exceptions: {traversal:?}"
    );
}

#[test]
fn analysis_does_not_reach_into_the_emitter() {
    let graph = resolved(&import_graph());

    // `analysis` may name the emitter's *collection* helper it shares, but it
    // must not import the emitter module itself: that is the edge that made
    // the dependency circular and stopped analysis being a separate stage.
    let imports = graph
        .get("codegen::analysis")
        .expect("analysis module exists");

    assert!(
        !imports.contains("codegen"),
        "codegen::analysis imports the emitter module (cycle). It may depend on \
         `ir` and on its own definitions only; move what it needs into analysis."
    );
}

#[test]
fn codegen_depends_on_analysis_one_way() {
    // Read the emitter's own `use` statements directly: a sibling module is
    // named `analysis::…` in `codegen/mod.rs`, and the point of this test is
    // that the direction is emitter -> analysis and never the reverse.
    let emitter = fs::read_to_string(src_root().join("codegen/mod.rs")).expect("read emitter");
    let imports_analysis = emitter.lines().any(|line| {
        let line = line.trim();
        line.starts_with("use analysis::") || line.starts_with("use analysis::{")
    });
    assert!(
        imports_analysis,
        "the emitter is expected to import analysis; if this changed, delete this test rather than the dependency"
    );

    let analysis =
        fs::read_to_string(src_root().join("codegen/analysis.rs")).expect("read analysis");
    assert!(
        !analysis.contains("super::"),
        "analysis must not reach into the emitter module; that edge is what made the dependency circular"
    );
}

#[test]
fn ir_does_not_depend_on_any_stage() {
    let graph = resolved(&import_graph());
    let imports = graph.get("ir").expect("ir module exists");
    let forbidden: Vec<&String> = imports
        .iter()
        .filter(|import| {
            import.starts_with("codegen")
                || import.starts_with("lower")
                || import.starts_with("ssr")
                || import.as_str() == "lib"
        })
        .collect();
    assert!(
        forbidden.is_empty(),
        "ir must stay a data definition; it imports {forbidden:?}"
    );
}

// Depth-first search over a graph of bounded size; recursion depth is the
// number of modules, which is small and fixed by the crate layout.
fn find_cycle_from(
    module: &str,
    graph: &BTreeMap<String, BTreeSet<String>>,
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
    if let Some(imports) = graph.get(module) {
        for import in imports {
            if graph.contains_key(import)
                && let Some(cycle) = find_cycle_from(import, graph, visiting, done, trail)
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

#[test]
fn the_crate_has_no_import_cycle() {
    // A cycle here is not cosmetic: it means no module in the loop can be
    // understood, tested or moved without the others.
    let graph = resolved(&import_graph());

    let mut visiting = BTreeSet::new();
    let mut done = BTreeSet::new();
    for module in graph.keys() {
        let mut trail = Vec::new();
        if let Some(cycle) = find_cycle_from(module, &graph, &mut visiting, &mut done, &mut trail) {
            panic!("import cycle: {}", cycle.join(" -> "));
        }
    }
}

#[test]
fn every_module_is_reachable_from_the_entry_point() {
    // An orphan module is dead code that still compiles; it also hides the real
    // shape of the graph.
    let graph = resolved(&import_graph());
    let children = child_modules();
    let mut reachable: BTreeSet<String> = BTreeSet::new();
    let mut stack = vec!["lib".to_string()];

    while let Some(module) = stack.pop() {
        if !reachable.insert(module.clone()) {
            continue;
        }
        for next in graph.get(&module).into_iter().flatten() {
            if graph.contains_key(next) {
                stack.push(next.clone());
            }
        }
        for child in children.get(&module).into_iter().flatten() {
            if graph.contains_key(child) {
                stack.push(child.clone());
            }
        }
    }

    // `#[cfg(test)] mod tests` blocks are inside their parent file, so every
    // module should be reachable; anything not reached is a real orphan.
    let unreachable: Vec<&String> = graph
        .keys()
        .filter(|module| !reachable.contains(module.as_str()))
        .collect();
    assert!(
        unreachable.is_empty(),
        "modules not reachable from lib.rs: {unreachable:?}"
    );
}
