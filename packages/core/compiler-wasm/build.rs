fn main() {
    // With the default 1 MiB shadow stack, JSX nested ~800 levels deep
    // overflows linear memory. From 2 MiB the engine's own call stack is the
    // limit (~1,400 levels in V8), so a larger stack only costs memory.
    if std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() == Ok("wasm32") {
        println!("cargo:rustc-link-arg=-zstack-size=2097152");
    }
}
