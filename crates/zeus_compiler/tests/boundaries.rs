//! Module dependency boundaries, enforced by parsing the crate's syntax.
//!
//! A doc comment cannot fail a build, so the layering this crate states is
//! checked here. The checks read `use` statements through [`depgraph`], which
//! parses with `syn`.
//!
//! The scanner this replaces resolved `pub(crate) use ssr::{…}` inside
//! `codegen/mod.rs` to `ssr` instead of `codegen::ssr`; the cycle finder skipped
//! the edge because no module called `ssr` existed, and reported a clean graph
//! on a tree that had a `codegen -> codegen::ssr -> codegen` cycle.
//!
//! Two habits keep that from returning: every test asserts
//! [`depgraph::Analysis::unresolved`] is empty, and every boundary has a
//! negative test that injects a violation into a synthetic crate and asserts
//! the checker names it.

mod depgraph;

use std::fs;
use std::path::{Path, PathBuf};

use depgraph::Analysis;

fn src_root() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("src")
}

fn analyse_crate() -> Analysis {
    let analysis = depgraph::analyse(&src_root());
    assert!(
        analysis.unresolved.is_empty(),
        "these `use` paths could not be resolved to a module; a boundary check \
         that skips them cannot see the edge they represent:\n  {}",
        analysis.unresolved.join("\n  ")
    );
    assert!(!analysis.modules.is_empty(), "no modules found under src/");
    analysis
}

// ---------------------------------------------------------------------------
// The crate's own boundaries
// ---------------------------------------------------------------------------

#[test]
fn support_is_a_leaf_layer() {
    // `support::hmr` now holds only the `HmrPlan` / `HmrBinding` data contract;
    // its IR traversal is a pass (`passes::hmr`). It still names IR types, so
    // it stays on this list until those types move too.
    // `support::hydration` still traverses the IR to build a plan — R18.3 debt.
    const MAY_TRAVERSE_IR: &[&str] = &["support::hmr", "support::hydration"];

    let analysis = analyse_crate();
    let mut offenders = Vec::new();

    for module in depgraph::modules_under(&analysis, "support") {
        for import in analysis.imports_of(&module) {
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

    let traversal: Vec<String> = depgraph::modules_under(&analysis, "support")
        .into_iter()
        .filter(|module| {
            analysis.imports(module, "ir") && !MAY_TRAVERSE_IR.contains(&module.as_str())
        })
        .collect();
    assert!(
        traversal.is_empty(),
        "these support modules read the IR without being listed as exceptions: {traversal:?}"
    );
}

#[test]
fn analysis_does_not_reach_into_the_emitter() {
    let analysis = analyse_crate();
    assert!(
        !analysis.imports("codegen::analysis", "codegen"),
        "codegen::analysis imports the emitter module. It may depend on `ir` and \
         its own definitions only."
    );
}

#[test]
fn codegen_depends_on_analysis_one_way() {
    let analysis = analyse_crate();
    assert!(
        analysis.imports("codegen", "codegen::analysis"),
        "the emitter is expected to import analysis"
    );
    assert!(
        !analysis.imports("codegen::analysis", "codegen"),
        "analysis must not import the emitter; that edge is the cycle"
    );
}

#[test]
fn ir_does_not_depend_on_any_stage() {
    let analysis = analyse_crate();
    let forbidden: Vec<String> = analysis
        .imports_of("ir")
        .into_iter()
        .filter(|import| {
            import.starts_with("codegen")
                || import.starts_with("lower")
                || import.starts_with("ssr")
                || import == "lib"
        })
        .collect();
    assert!(
        forbidden.is_empty(),
        "ir must stay a data definition; it imports {forbidden:?}"
    );
}

/// No module may import, directly or through a chain, a module that imports it.
///
/// This was relaxed to "the known `codegen <-> codegen::ssr` pair only" while
/// PR-A landed the scanner fix that made the pair visible. PR-B moved SSR's
/// shared infrastructure into `codegen::infra` and its own symbols into
/// `codegen::ssr`, so the pair is gone and the assertion is strict again.
#[test]
fn the_crate_has_no_import_cycle() {
    let analysis = analyse_crate();
    if let Some(cycle) = analysis.first_cycle() {
        panic!("import cycle: {}", cycle.join(" -> "));
    }
}

// ---------------------------------------------------------------------------
// The checker itself: one synthetic crate per case
// ---------------------------------------------------------------------------

struct Fixture {
    root: PathBuf,
}

impl Fixture {
    fn new(name: &str) -> Self {
        let root =
            std::env::temp_dir().join(format!("zeus-depgraph-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("src")).expect("create fixture src");
        Self { root }
    }

    fn file(self, path: &str, contents: &str) -> Self {
        let target = self.root.join("src").join(path);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).expect("create fixture directory");
        }
        fs::write(target, contents).expect("write fixture file");
        self
    }

    fn analyse(&self) -> Analysis {
        depgraph::analyse(&self.root.join("src"))
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

#[test]
fn a_declaration_only_tree_is_not_a_cycle() {
    let fixture = Fixture::new("declarations")
        .file("lib.rs", "mod a;\nmod b;\n")
        .file("a.rs", "pub fn x() {}\n")
        .file("b.rs", "use crate::a::x;\npub fn y() { x() }\n");
    let analysis = fixture.analyse();

    assert!(analysis.unresolved.is_empty(), "{:?}", analysis.unresolved);
    assert_eq!(analysis.first_cycle(), None, "declarations are not edges");
    assert!(analysis.imports("b", "a"), "b uses a");
    assert!(!analysis.imports("a", "b"), "a does not use b");
}

#[test]
fn a_direct_cycle_is_reported() {
    let fixture = Fixture::new("direct")
        .file("lib.rs", "mod a;\nmod b;\n")
        .file("a.rs", "use crate::b::y;\npub fn x() { y() }\n")
        .file("b.rs", "use crate::a::x;\npub fn y() { x() }\n");
    let analysis = fixture.analyse();

    let cycle = analysis.first_cycle().expect("a <-> b must be caught");
    assert!(
        cycle.len() >= 3 && cycle.first() == cycle.last(),
        "a cycle is a closed path: {cycle:?}"
    );
}

#[test]
fn an_indirect_cycle_is_reported() {
    let fixture = Fixture::new("indirect")
        .file("lib.rs", "mod a;\nmod b;\nmod c;\n")
        .file("a.rs", "use crate::b::y;\npub fn x() { y() }\n")
        .file("b.rs", "use crate::c::z;\npub fn y() { z() }\n")
        .file("c.rs", "use crate::a::x;\npub fn z() { x() }\n");
    let analysis = fixture.analyse();

    let cycle = analysis
        .first_cycle()
        .expect("a -> b -> c -> a must be caught");
    assert_eq!(
        cycle.len(),
        4,
        "three modules plus the closing repeat: {cycle:?}"
    );
}

#[test]
fn a_sibling_import_from_a_mod_file_resolves_to_the_full_path() {
    let fixture = Fixture::new("sibling")
        .file("lib.rs", "mod codegen;\n")
        .file(
            "codegen/mod.rs",
            "mod ssr;\npub(crate) use ssr::emit;\npub fn emit_dom() {}\n",
        )
        .file(
            "codegen/ssr.rs",
            "use super::emit_dom;\npub fn emit() { emit_dom() }\n",
        );
    let analysis = fixture.analyse();

    assert!(analysis.unresolved.is_empty(), "{:?}", analysis.unresolved);
    assert!(
        analysis.imports("codegen", "codegen::ssr"),
        "the sibling import must resolve to codegen::ssr; edges were {:?}",
        analysis.edges
    );
    assert!(
        analysis.imports("codegen::ssr", "codegen"),
        "`super::` from codegen::ssr names codegen"
    );

    let cycle = analysis
        .first_cycle()
        .expect("codegen <-> codegen::ssr is a real cycle");
    assert!(cycle.contains(&"codegen".to_string()), "{cycle:?}");
    assert!(cycle.contains(&"codegen::ssr".to_string()), "{cycle:?}");
}

#[test]
fn a_grouped_crate_import_records_every_member() {
    let fixture = Fixture::new("grouped")
        .file("lib.rs", "mod a;\nmod b;\nmod c;\n")
        .file(
            "a.rs",
            "use crate::{b::y, c::z};\npub fn x() { y(); z() }\n",
        )
        .file("b.rs", "pub fn y() {}\n")
        .file("c.rs", "pub fn z() {}\n");
    let analysis = fixture.analyse();

    assert!(analysis.unresolved.is_empty(), "{:?}", analysis.unresolved);
    assert!(
        analysis.imports("a", "b"),
        "the group's b member was dropped"
    );
    assert!(
        analysis.imports("a", "c"),
        "the group's c member was dropped"
    );
}

#[test]
fn the_pr327_analysis_cycle_can_be_reinjected_and_is_caught() {
    let fixture = Fixture::new("pr327")
        .file("lib.rs", "mod codegen;\nmod ir;\n")
        .file("ir.rs", "pub struct ModuleIr;\n")
        .file(
            "codegen/mod.rs",
            "mod analysis;\nuse analysis::collect;\n\
             pub(super) enum RuntimeHelper { A }\npub fn emit() { collect() }\n",
        )
        .file(
            "codegen/analysis.rs",
            "use super::RuntimeHelper;\nuse crate::ir::ModuleIr;\n\
             pub fn collect() { let _ = RuntimeHelper::A; let _: Option<ModuleIr> = None; }\n",
        );
    let analysis = fixture.analyse();

    assert!(
        analysis.imports("codegen::analysis", "codegen"),
        "analysis -> emitter must be recorded"
    );
    assert!(
        analysis.imports("codegen", "codegen::analysis"),
        "emitter -> analysis must be recorded"
    );
    let cycle = analysis
        .first_cycle()
        .expect("the #327 cycle must be detected when reinjected");
    assert!(cycle.contains(&"codegen".to_string()), "{cycle:?}");
    assert!(
        cycle.contains(&"codegen::analysis".to_string()),
        "{cycle:?}"
    );
}

#[test]
fn an_edge_to_a_module_that_does_not_exist_is_reported() {
    let fixture = Fixture::new("dangling")
        .file("lib.rs", "mod a;\n")
        .file("a.rs", "use nowhere::thing;\npub fn x() {}\n");
    let analysis = fixture.analyse();

    assert!(
        analysis
            .unresolved
            .iter()
            .any(|entry| entry.contains("nowhere")),
        "the report must name the dangling edge: {:?}",
        analysis.unresolved
    );
}

#[test]
fn an_orphan_module_is_reported() {
    let fixture = Fixture::new("orphan")
        .file("lib.rs", "mod a;\n")
        .file("a.rs", "pub fn x() {}\n")
        .file("b.rs", "pub fn y() {}\n");
    let analysis = fixture.analyse();

    let unreachable = analysis.unreachable();
    assert!(
        unreachable.contains(&"b".to_string()),
        "b is declared nowhere and must be reported: {unreachable:?}"
    );
    assert!(
        !unreachable.contains(&"a".to_string()),
        "a is reachable through `mod a`"
    );
}
