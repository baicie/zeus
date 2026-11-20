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
fn codegen_does_not_import_lowering() {
    // Cross-stage data belongs in `stage_contracts`, which both sides may
    // name. An emitter importing `lower` would make it depend on how lowering
    // collects its side channels, so a change to collection would be
    // indistinguishable from a change to the contract.
    let analysis = analyse_crate();
    for module in depgraph::modules_under(&analysis, "codegen") {
        assert!(
            !analysis.imports(&module, "lower"),
            "{module} imports the lowering module; move the type it needs into \
             `stage_contracts`"
        );
    }
}

#[test]
fn stage_contracts_imports_no_stage() {
    // The contract module must stay nameable by both sides without pulling
    // either in.
    let analysis = analyse_crate();
    let forbidden: Vec<String> = analysis
        .imports_of("stage_contracts")
        .into_iter()
        .filter(|import| {
            import.starts_with("codegen")
                || import.starts_with("lower")
                || import.starts_with("passes")
                || import.starts_with("analysis")
        })
        .collect();
    assert!(
        forbidden.is_empty(),
        "stage_contracts must not depend on a stage; it imports {forbidden:?}"
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

/// A call through a qualified path is an edge, and a cycle through one is a
/// cycle.
///
/// This is the gap that let a real move look safe. When the hydration emitter
/// was first extracted from `codegen`, `mod.rs` called it as
/// `hydration::emit_auto_hydrated_component(..)` — a qualified path, not a
/// `use`. The checker only read `use` statements, reported a clean graph, and
/// the two modules were in fact mutually dependent; rewriting the call as a
/// `use` made the cycle appear immediately. A checker that cannot see how the
/// code is actually written is not a checker.
#[test]
fn a_cycle_through_a_qualified_call_is_reported() {
    let fixture = Fixture::new("qualified-cycle")
        .file("lib.rs", "mod a;\nmod b;\n")
        .file("a.rs", "pub fn run() { b::work() }\n")
        .file("b.rs", "use crate::a::run;\npub fn work() { run() }\n");
    let analysis = fixture.analyse();

    assert!(
        analysis.imports("a", "b"),
        "`b::work()` in a.rs is a dependency on b; edges were {:?}",
        analysis.edges
    );
    let cycle = analysis
        .first_cycle()
        .expect("a -> b -> a through a qualified call must be caught");
    assert!(cycle.contains(&"a".to_string()), "{cycle:?}");
    assert!(cycle.contains(&"b".to_string()), "{cycle:?}");
}

/// A qualified path whose root is not a module is not an edge.
///
/// `usize::MAX` and `walk::visit_x` look like module paths to a tokeniser.
/// Counting them would make every file depend on nothing in particular and
/// drown the real edges.
#[test]
fn a_qualified_path_to_a_non_module_is_not_an_edge() {
    let fixture = Fixture::new("qualified-nonmodule")
        .file("lib.rs", "mod a;\n")
        .file(
            "a.rs",
            "pub fn f() -> usize { usize::MAX }\n\
             pub fn g(v: u64) -> u32 { u32::try_from(v).unwrap_or(0) }\n",
        );
    let analysis = fixture.analyse();

    assert!(
        analysis.unresolved.is_empty(),
        "intrinsic paths must not be reported as unresolved: {:?}",
        analysis.unresolved
    );
    assert!(
        analysis.imports_of("a").is_empty(),
        "`usize::MAX` is not a module; edges were {:?}",
        analysis.imports_of("a")
    );
}

/// A qualified call to a submodule resolves relative to the calling module.
///
/// `b::work()` in `a/mod.rs` is `a::b`, not the crate-root `b`. The checker
/// first looked for a module literally named `b`, found none, and recorded no
/// edge at all — so `a <-> a::b` was invisible.
#[test]
fn a_qualified_call_to_a_submodule_is_an_edge() {
    let fixture = Fixture::new("submodule-qualified")
        .file("lib.rs", "mod a;\n")
        .file("a/mod.rs", "mod b;\npub fn run() { b::work(); }\n")
        .file("a/b.rs", "use super::run;\npub fn work() { run(); }\n");
    let analysis = fixture.analyse();

    assert!(
        analysis.imports("a", "a::b"),
        "`b::work()` in a/mod.rs is a::b; edges were {:?}",
        analysis.edges
    );
    assert!(analysis.imports("a::b", "a"), "the `super::run` import");
    let cycle = analysis
        .first_cycle()
        .expect("a -> a::b -> a must be caught");
    assert!(cycle.contains(&"a".to_string()), "{cycle:?}");
    assert!(cycle.contains(&"a::b".to_string()), "{cycle:?}");
}

/// `crate::b::work` names the crate-root `b`, not a module under `a`.
///
/// The path arrives as `PrefixCandidates`, which the qualified-path pass
/// dropped after the `use` pass had already handled its own. That is why the
/// two paths are now resolved by one function.
#[test]
fn a_crate_qualified_call_is_an_edge() {
    let fixture = Fixture::new("crate-qualified")
        .file("lib.rs", "mod a;\nmod b;\n")
        .file("a.rs", "pub fn run() { crate::b::work(); }\n")
        .file("b.rs", "use crate::a::run;\npub fn work() { run(); }\n");
    let analysis = fixture.analyse();

    assert!(
        analysis.imports("a", "b"),
        "`crate::b::work()` in a.rs; edges were {:?}",
        analysis.edges
    );
    let cycle = analysis.first_cycle().expect("a -> b -> a must be caught");
    assert!(cycle.contains(&"a".to_string()), "{cycle:?}");
    assert!(cycle.contains(&"b".to_string()), "{cycle:?}");
}

/// `self::`, `super::` and `super::super::` resolve to the module they name,
/// not to the crate root on the way back down.
#[test]
fn self_and_super_qualified_calls_name_the_right_module() {
    let self_case = Fixture::new("self-qualified")
        .file("lib.rs", "mod a;\n")
        .file(
            "a/mod.rs",
            "mod child;\npub fn run() { self::child::run(); }\n",
        )
        .file("a/child.rs", "pub fn run() {}\n")
        .analyse();
    assert!(self_case.imports("a", "a::child"), "{:?}", self_case.edges);

    let super_case = Fixture::new("super-qualified")
        .file("lib.rs", "mod a;\n")
        .file("a/mod.rs", "mod b;\nmod sibling;\n")
        .file("a/b.rs", "pub fn run() { super::sibling::run(); }\n")
        .file("a/sibling.rs", "pub fn run() {}\n")
        .analyse();
    assert!(
        super_case.imports("a::b", "a::sibling"),
        "{:?}",
        super_case.edges
    );

    // `super::super` from `a::b` reaches the crate root; the target is `root`,
    // not `lib`. Collapsing the base to the literal `lib` made the prefix walk
    // match `lib` and report a dependency on the crate root.
    let grandparent = Fixture::new("grandparent-qualified")
        .file("lib.rs", "mod a;\nmod root;\n")
        .file("a/mod.rs", "mod b;\n")
        .file("a/b.rs", "pub fn run() { super::super::root::run(); }\n")
        .file("root.rs", "pub fn run() {}\n")
        .analyse();
    assert!(
        grandparent.imports("a::b", "root"),
        "super::super must reach the crate root's `root`, not `lib`; edges were {:?}",
        grandparent.edges
    );
    assert!(
        !grandparent.imports("a::b", "lib"),
        "the crate root is not an edge target here; edges were {:?}",
        grandparent.edges
    );
}

/// Every expression position that can hold a qualified call is walked.
///
/// The hand-written recursion covered about a dozen `Expr` variants; this test
/// is the list of the ones it missed. Each case puts one qualified call in a
/// different syntactic position and asserts the edge exists.
#[test]
fn qualified_calls_are_found_in_every_expression_position() {
    // (case name, source for a.rs, expected edge target)
    let cases: &[(&str, &str, &str)] = &[
        ("call", "pub fn f() { b::work(); }", "b"),
        ("binary", "pub fn f() -> bool { b::work() && true }", "b"),
        ("assign", "pub fn f() { let mut x = 0; x = b::num(); }", "b"),
        ("array", "pub fn f() -> [u32; 1] { [b::num()] }", "b"),
        ("tuple", "pub fn f() -> (u32, u32) { (b::num(), 0) }", "b"),
        ("struct", "pub fn f() -> S { S { v: b::num() } }", "b"),
        (
            "if",
            "pub fn f() -> u32 { if b::flag() { 1 } else { 0 } }",
            "b",
        ),
        (
            "match",
            "pub fn f() -> u32 { match b::num() { _ => 0 } }",
            "b",
        ),
        ("closure", "pub fn f() { let g = || b::work(); g(); }", "b"),
        ("loop", "pub fn f() { loop { b::work(); break; } }", "b"),
        ("while", "pub fn f() { while b::flag() { break; } }", "b"),
        ("for_loop", "pub fn f() { for _ in b::items() {} }", "b"),
        ("local", "pub fn f() { let _x = b::num(); }", "b"),
    ];

    for (name, body, expected) in cases {
        let fixture = Fixture::new(&format!("expr-{name}"))
            .file("lib.rs", "mod a;\nmod b;\n")
            .file("a.rs", &format!("struct S {{ v: u32 }}\n{body}\n"))
            .file(
                "b.rs",
                "pub fn work() {}\npub fn num() -> u32 { 0 }\n\
                 pub fn flag() -> bool { true }\n\
                 pub fn items() -> Vec<u32> { Vec::new() }\n",
            );
        let analysis = fixture.analyse();
        assert!(
            analysis.imports("a", expected),
            "case `{name}`: a qualified call must be an edge; edges were {:?}",
            analysis.edges
        );
    }
}

/// A qualified call inside an `impl` body or a trait default method is an edge.
#[test]
fn qualified_calls_inside_impl_and_trait_defaults_are_edges() {
    let fixture = Fixture::new("expr-impl-trait")
        .file("lib.rs", "mod a;\nmod b;\n")
        .file(
            "a.rs",
            "pub struct S;\n\
             impl S {\n\
                 pub fn m(&self) { b::work(); }\n\
             }\n\
             pub trait T {\n\
                 fn t(&self) { b::work(); }\n\
             }\n\
             pub const C: u32 = b::num();\n\
             pub static D: u32 = b::num();\n",
        )
        .file("b.rs", "pub fn work() {}\npub fn num() -> u32 { 0 }\n");
    let analysis = fixture.analyse();

    assert!(
        analysis.imports("a", "b"),
        "impl methods, trait defaults and const/static initialisers all call b; \
         edges were {:?}",
        analysis.edges
    );
}

/// A type path is not a module call.
///
/// `crate::ir::ModuleIr` in a signature says nothing about a run-time
/// dependency. Counting type paths would give every file an edge for a
/// documentation-only mention and drown the real ones.
#[test]
fn a_type_path_is_not_a_module_edge() {
    let fixture = Fixture::new("type-path")
        .file("lib.rs", "mod a;\nmod b;\n")
        .file(
            "a.rs",
            "pub fn f(_x: crate::b::Thing) -> Option<crate::b::Thing> { None }\n",
        )
        .file("b.rs", "pub struct Thing;\n");
    let analysis = fixture.analyse();

    assert!(
        !analysis.imports("a", "b"),
        "a type path is not a run-time dependency; edges were {:?}",
        analysis.edges
    );
}

/// A `use` alias is an edge through the import, not through the call site.
///
/// `use crate::b::work as do_it; do_it();` depends on `b` because of the
/// import. The bare `do_it()` names a local binding, and resolving it would
/// require the symbol table the checker does not have.
#[test]
fn a_use_alias_is_an_edge_through_the_import() {
    let fixture = Fixture::new("alias")
        .file("lib.rs", "mod a;\nmod b;\n")
        .file(
            "a.rs",
            "use crate::b::work as do_it;\npub fn f() { do_it(); }\n",
        )
        .file("b.rs", "pub fn work() {}\n");
    let analysis = fixture.analyse();

    assert!(
        analysis.imports("a", "b"),
        "the `use … as do_it` is the edge; edges were {:?}",
        analysis.edges
    );
    assert!(analysis.unresolved.is_empty(), "{:?}", analysis.unresolved);
}

/// A local binding that shadows a module name is not an edge.
///
/// `let b = 1; b.to_string()` has no prefix at all, so it cannot reach the
/// qualified-path pass. The case is listed here because it is the shape a
/// reader would expect to be wrong.
#[test]
fn a_local_binding_named_like_a_module_is_not_an_edge() {
    let fixture = Fixture::new("shadow")
        .file("lib.rs", "mod a;\nmod b;\n")
        .file("a.rs", "pub fn f() { let b = 1; let _ = b.to_string(); }\n")
        .file("b.rs", "pub fn work() {}\n");
    let analysis = fixture.analyse();

    assert!(
        !analysis.imports("a", "b"),
        "a local binding is not a module; edges were {:?}",
        analysis.edges
    );
}

/// A qualified path inside a macro body is **not** seen, and that is recorded
/// rather than papered over.
///
/// `syn` parses `println!("{}", b::num())` as an `Expr::Macro` whose body is an
/// unparsed `TokenStream`. Walking those tokens would mean re-implementing
/// expression parsing for an arbitrary macro grammar, and a match on
/// `ident :: ident` inside a `format!` string literal would be a false edge.
///
/// The consequence is stated so nobody over-reads a clean result: **this
/// checker does not see through macro expansion.** A dependency that exists
/// only inside a macro body is invisible to it. That is acceptable for this
/// crate because module calls do not live in macros here, but it is a limit of
/// the analysis, not a property of the code.
#[test]
fn a_qualified_path_inside_a_macro_body_is_not_seen() {
    let fixture = Fixture::new("macro-body")
        .file("lib.rs", "mod a;\nmod b;\n")
        .file("a.rs", "pub fn f() { println!(\"{}\", b::num()); }\n")
        .file("b.rs", "pub fn num() -> u32 { 0 }\n");
    let analysis = fixture.analyse();

    assert!(
        !analysis.imports("a", "b"),
        "the checker does not parse macro bodies; if this starts passing, the \
         limitation changed and the doc comment on `qualified_paths` is stale"
    );
}

// ---------------------------------------------------------------------------
// The DOM subsystem's ownership
// ---------------------------------------------------------------------------

/// The DOM data model does not depend on the codegen orchestrator.
///
/// `GeneratedComponent` and `DynamicBinding` are DOM types: they describe a
/// cloned node and what attaches to it. The orchestrator uses them; they must
/// not reach back. If this fails, something in `dom/model.rs` is calling into
/// `codegen/mod.rs`, which is the shape that made the previous hydration
/// extraction look like a cycle.
#[test]
fn the_dom_model_does_not_depend_on_the_orchestrator() {
    let analysis = analyse_crate();
    assert!(
        !analysis.imports("codegen::dom::model", "codegen"),
        "dom/model.rs imports the orchestrator; the model is a lower layer than \
         the code that drives it. Imports were {:?}",
        analysis.imports_of("codegen::dom::model")
    );
}

/// The model reaches only the shared infrastructure, the IR and leaf support.
#[test]
fn the_dom_model_depends_only_on_lower_layers() {
    let analysis = analyse_crate();
    let allowed = [
        "codegen::infra",
        "ir",
        "support::html",
        "support::span",
        "support::diagnostic",
    ];
    let unexpected: Vec<String> = analysis
        .imports_of("codegen::dom::model")
        .into_iter()
        .filter(|target| !allowed.contains(&target.as_str()))
        .collect();
    assert!(
        unexpected.is_empty(),
        "dom/model.rs depends on {unexpected:?}, which is outside its layer"
    );
}

/// The orchestrator may depend on the DOM subsystem, and does.
#[test]
fn the_orchestrator_depends_on_the_dom_subsystem() {
    let analysis = analyse_crate();
    assert!(
        analysis.imports("codegen", "codegen::dom"),
        "the orchestrator is expected to use the DOM types; edges were {:?}",
        analysis.imports_of("codegen")
    );
}
