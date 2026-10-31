//! WebAssembly host for the Zeus compiler.
//!
//! The host only moves JSON across linear memory and validates options the
//! same way as the Node.js adapter; parsing, lowering and code generation are
//! the shared `zeus_compiler` crate. The request is the `transformModule`
//! options object and the response is `{ "status": "ok", "result": ... }` or
//! `{ "status": "error", "message": ... }`.

use serde::{Deserialize, Serialize};
use zeus_compiler::{
    PureDefineElementMode, TransformModuleOptions, TransformModuleResult, TransformTarget,
};

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HostOptions {
    source: String,
    filename: String,
    target: String,
    runtime_module: String,
    delegate_events: bool,
    source_map: bool,
    hmr: Option<bool>,
    pure_define_element: Option<bool>,
}

#[derive(Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
enum Response {
    Ok { result: Box<TransformModuleResult> },
    Error { message: String },
}

/// Transforms one JSON request into a JSON response.
///
/// # Panics
///
/// Never in practice: every compiler result is plain serializable data.
pub fn respond(request: &[u8]) -> String {
    let response = match transform(request) {
        Ok(result) => Response::Ok {
            result: Box::new(result),
        },
        Err(message) => Response::Error { message },
    };
    serde_json::to_string(&response).expect("compiler results always serialize")
}

fn transform(request: &[u8]) -> Result<TransformModuleResult, String> {
    let options: HostOptions =
        serde_json::from_slice(request).map_err(|error| error.to_string())?;
    // Keep these messages identical to `@zeus-js/compiler-native`.
    let target = match options.target.as_str() {
        "dom" => TransformTarget::Dom,
        "ssr" => TransformTarget::Ssr,
        _ => return Err("target must be \"dom\" or \"ssr\"".into()),
    };
    if options.filename.is_empty() {
        return Err("filename must not be empty".into());
    }
    if options.runtime_module.is_empty() {
        return Err("runtimeModule must not be empty".into());
    }

    Ok(zeus_compiler::transform_module(TransformModuleOptions {
        source: options.source,
        filename: options.filename,
        target,
        runtime_module: options.runtime_module,
        delegate_events: options.delegate_events,
        source_map: options.source_map,
        hmr: options.hmr.unwrap_or(false),
        pure_define_element: PureDefineElementMode::from(
            options.pure_define_element.unwrap_or(false),
        ),
    }))
}

/// The linear-memory ABI. Only this module touches raw pointers.
#[cfg(target_arch = "wasm32")]
#[allow(unsafe_code)]
mod abi {
    /// Allocates `len` bytes for the host to write a UTF-8 JSON request into.
    #[unsafe(no_mangle)]
    pub extern "C" fn zeus_alloc(len: usize) -> *mut u8 {
        let mut buffer = Vec::<u8>::with_capacity(len);
        let pointer = buffer.as_mut_ptr();
        std::mem::forget(buffer);
        pointer
    }

    /// Releases a response buffer returned by `zeus_transform`.
    ///
    /// # Safety
    ///
    /// `pointer` and `len` must describe a buffer returned by `zeus_transform`
    /// that has not been released yet.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn zeus_free(pointer: *mut u8, len: usize) {
        drop(unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(pointer, len)) });
    }

    /// Consumes the request written to `zeus_alloc(len)` and returns the
    /// response buffer packed as `pointer << 32 | len`.
    ///
    /// # Safety
    ///
    /// `pointer` must come from `zeus_alloc(len)` and hold `len` initialized
    /// bytes. The request buffer is released by this call.
    #[unsafe(no_mangle)]
    pub unsafe extern "C" fn zeus_transform(pointer: *mut u8, len: usize) -> u64 {
        let request = unsafe { Box::from_raw(std::ptr::slice_from_raw_parts_mut(pointer, len)) };
        let response = super::respond(&request).into_bytes().into_boxed_slice();
        let response_len = response.len() as u64;
        let response_pointer = Box::into_raw(response).cast::<u8>().addr() as u64;
        (response_pointer << 32) | response_len
    }
}

#[cfg(test)]
mod tests {
    use super::respond;
    use serde_json::{Value, json};

    fn request(overrides: &Value) -> Value {
        let mut options = json!({
            "source": "export const App = props => <p>{props.name}</p>",
            "filename": "App.tsx",
            "target": "dom",
            "runtimeModule": "@zeus-js/runtime-dom",
            "delegateEvents": true,
            "sourceMap": true,
        });
        for (key, value) in overrides.as_object().unwrap() {
            options[key] = value.clone();
        }
        serde_json::from_str(&respond(options.to_string().as_bytes())).unwrap()
    }

    #[test]
    fn returns_the_compiler_result_for_valid_options() {
        let response = request(&json!({}));

        assert_eq!(response["status"], "ok");
        assert!(
            response["result"]["code"]
                .as_str()
                .unwrap()
                .contains("bindText")
        );
        assert_eq!(response["result"]["map"]["version"], 3);
        assert_eq!(response["result"]["hydrationPlan"]["version"], 1);
    }

    #[test]
    fn rejects_invalid_options_with_the_native_messages() {
        for (overrides, message) in [
            (
                json!({ "target": "wasm" }),
                "target must be \"dom\" or \"ssr\"",
            ),
            (json!({ "filename": "" }), "filename must not be empty"),
            (
                json!({ "runtimeModule": "" }),
                "runtimeModule must not be empty",
            ),
        ] {
            let response = request(&overrides);
            assert_eq!(response["status"], "error");
            assert_eq!(response["message"], message);
        }
    }

    #[test]
    fn reports_malformed_requests_without_panicking() {
        let response: Value = serde_json::from_str(&respond(b"{")).unwrap();

        assert_eq!(response["status"], "error");
        assert!(response["message"].as_str().unwrap().contains("EOF"));
    }
}
