use std::{fs, path::PathBuf};

use zeus_compiler::lower::lower_module;

const SOURCE: &str = include_str!("../../../scripts/playground/fixtures/counter.tsx");
const IR_SNAPSHOT: &str = include_str!("../../../scripts/playground/fixtures/counter.ir.json");

#[test]
fn playground_ir_snapshot_matches_rust_lowering() {
    let result = lower_module(SOURCE, "counter.tsx");
    assert!(result.diagnostics.is_empty(), "{:?}", result.diagnostics);
    let ir = result.ir.expect("valid fixture produces internal IR");
    let actual = format!("{}\n", serde_json::to_string_pretty(&ir).unwrap());

    if std::env::var_os("ZEUS_UPDATE_PLAYGROUND_IR").is_some() {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../scripts/playground/fixtures/counter.ir.json");
        fs::write(path, actual).expect("write playground IR snapshot");
        return;
    }

    assert_eq!(
        actual, IR_SNAPSHOT,
        "run with ZEUS_UPDATE_PLAYGROUND_IR=1 to refresh"
    );
}
