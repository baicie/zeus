use napi_derive::napi;
use zeus_compiler_dom::{DomCompiler, DomCompilerOptions};
use zeus_compiler_core::CompilerOptions as CoreCompilerOptions;
use zeus_compiler_web_component::{WebComponentCompiler, WebComponentCompilerOptions};
use oxc::span::SourceType;

// 编译器选项
#[napi(object)]
pub struct CompilerOptions {
  pub source_type: String,
  pub experimental: bool,
  pub target: String,
  pub minify: bool,
}

// 编译器结果
#[napi(object)]
pub struct CompilerResult {
  pub code: String,
  pub success: bool,
  pub errors: Vec<String>,
}

// 编译函数
#[napi]
pub fn compiler(source: String, options: CompilerOptions) -> CompilerResult {
  let source_type = match options.source_type.as_str() {
    "js" => SourceType::default(),
    "jsx" => SourceType::jsx(),
    "ts" => SourceType::ts(),
    "tsx" => SourceType::tsx(),
    _ => SourceType::default(),
  };

  let dom_compiler = DomCompiler::new();
  let is_jsx = source_type.is_jsx();

  let dom_options = DomCompilerOptions {
    base: CoreCompilerOptions {
      source_type,
      experimental: options.experimental,
    },
    jsx: is_jsx,
    jsx_pragma: None,
    jsx_pragma_frag: None,
    dom_optimizations: true,
    runtime_module: None,
  };

  match dom_compiler.compile_dom(&source, &dom_options) {
    Ok(code) => {
      CompilerResult {
        code,
        success: true,
        errors: vec![],
      }
    }
    Err(error) => {
      // 从 OxcDiagnostic 中提取位置信息
      // 调试输出显示: labels: Some([LabeledSpan { span: SourceSpan { offset: SourceOffset(22), length: 1 } ...
      
      let error_str = format!("{:?}", error);
      let offset = extract_offset_from_diagnostic(&error_str);
      let (line, column) = if let Some(off) = offset {
        offset_to_line_column(&source, off)
      } else {
        (1, 1)
      };
      
      // 获取代码片段
      let snippet = extract_code_snippet(&source, line, column);
      
      let snippet_str = if let Some(s) = snippet {
        format!(
          "\n\x1b[37m {}\x1b[0m |\n\x1b[37m {}\x1b[0m | {}\n\x1b[37m {}\x1b[0m | \x1b[31m{}\x1b[0m",
          s.line_num, s.line_num, s.line_content, s.line_num, s.indicator
        )
      } else {
        String::new()
      };
      
      // 提取简洁的错误消息
      let message = extract_message_from_diagnostic(&error_str);
      
      let error_message = format!(
        "\n\x1b[31m\x1b[1merror\x1b[0m: {}{}\n\x1b[34m--> \x1b[1m{}:{}\x1b[0m\n",
        message,
        snippet_str,
        line, column
      );
      
      CompilerResult {
        code: format!("// Compilation failed\n// Error: {}", error_message),
        success: false,
        errors: vec![error_message],
      }
    }
  }
}

/// 从诊断调试字符串中提取偏移量
fn extract_offset_from_diagnostic(debug_str: &str) -> Option<u32> {
    // 查找 "offset: SourceOffset(X)" 模式 - 优先找主要的 (primary: true)
    // 格式: LabeledSpan { label: Some("..."), span: SourceSpan { offset: SourceOffset(X), length: Y }, primary: true }
    
    // 找第一个 primary: true 的 LabeledSpan
    if let Some(primary_pos) = debug_str.find("primary: true") {
        let before_primary = &debug_str[..primary_pos];
        // 找这个 LabeledSpan 中的 offset
        if let Some(span_pos) = before_primary.rfind("SourceSpan {") {
            let after_span = &before_primary[span_pos..];
            if let Some(offset_pos) = after_span.find("offset:") {
                let after_offset = &after_span[offset_pos..];
                if let Some(paren_start) = after_offset.find('(') {
                    let after_paren = &after_offset[paren_start + 1..];
                    if let Some(num_start) = after_paren.find(|c: char| c.is_ascii_digit()) {
                        let num_str = &after_paren[num_start..];
                        let num_end = num_str.find(|c: char| !c.is_ascii_digit()).unwrap_or(num_str.len());
                        if let Ok(offset) = num_str[..num_end].parse::<u32>() {
                            return Some(offset);
                        }
                    }
                }
            }
        }
    }
    
    // Fallback: 找任意一个 offset
    if let Some(offset_pos) = debug_str.find("offset:") {
        let after_offset = &debug_str[offset_pos..];
        if let Some(paren_start) = after_offset.find('(') {
            let after_paren = &after_offset[paren_start + 1..];
            if let Some(num_start) = after_paren.find(|c: char| c.is_ascii_digit()) {
                let num_str = &after_paren[num_start..];
                let num_end = num_str.find(|c: char| !c.is_ascii_digit()).unwrap_or(num_str.len());
                if let Ok(offset) = num_str[..num_end].parse::<u32>() {
                    return Some(offset);
                }
            }
        }
    }
    None
}

/// 从诊断调试字符串中提取错误消息
fn extract_message_from_diagnostic(debug_str: &str) -> String {
    // 查找 "message: " 后面的内容
    if let Some(msg_pos) = debug_str.find("message:") {
        let after_msg = &debug_str[msg_pos + 8..];
        // 找到下一个逗号后跟 labels/help/note 的位置
        // 格式: message: "...", labels: ...
        if let Some(end_pos) = after_msg.find(", labels:") {
            let msg = after_msg[..end_pos].trim();
            // 去掉首尾引号
            let msg = msg.trim_matches('"');
            // 处理转义字符
            return msg.replace("\\\"", "\"");
        }
        if let Some(end_pos) = after_msg.find(',') {
            let msg = after_msg[..end_pos].trim();
            // 去掉首尾引号
            let msg = msg.trim_matches('"');
            // 处理转义字符
            return msg.replace("\\\"", "\"");
        }
    }
    "Unknown error".to_string()
}

/// 将字节偏移转换为行号和列号 (1-based)
fn offset_to_line_column(source: &str, offset: u32) -> (u32, u32) {
  let mut line = 1u32;
  let mut column = 1u32;
  
  for (i, c) in source.char_indices() {
    if i as u32 >= offset {
      break;
    }
    if c == '\n' {
      line += 1;
      column = 1;
    } else {
      column += 1;
    }
  }
  
  (line, column)
}

/// 代码片段结构
struct CodeSnippet {
    line_num: usize,
    line_content: String,
    indicator: String,
}

/// 提取错误位置的代码片段
fn extract_code_snippet(source: &str, line: u32, column: u32) -> Option<CodeSnippet> {
    let line_content = source.lines().nth(line as usize - 1)?.to_string();

    // Create indicator (caret) at the error position
    let indicator = format!("{}^", " ".repeat(column.saturating_sub(1) as usize));

    Some(CodeSnippet {
        line_num: line as usize,
        line_content,
        indicator,
    })
}

// ============================================================
// Web Component 编译器 NAPI 绑定
// ============================================================

/// Web Component 宏编译器选项
#[napi(object)]
pub struct WebComponentMacroOptions {
    /// 是否启用宏编译 (defineProps, defineEmits, defineExpose)
    /// @default true
    pub enable_macros: Option<bool>,
    /// 自动检测宏使用并启用编译
    /// @default true
    pub auto_detect: Option<bool>,
    /// 宏导入模块路径 (默认: "@zeus-js/web-components")
    pub macro_module: Option<String>,
    /// 保留原始宏调用 (用于调试)
    /// @default false
    pub preserve_macros: Option<bool>,
}

/// Web Component 宏编译结果
#[napi(object)]
pub struct WebComponentMacroResult {
    /// 转换后的代码
    pub code: String,
    /// 是否找到并处理了宏
    pub macros_found: bool,
    /// 提取的宏定义
    pub macros: Option<WebComponentMacroDefinitions>,
}

/// 提取的宏定义
#[napi(object)]
pub struct WebComponentMacroDefinitions {
    /// defineProps 定义
    pub props: Option<MacroPropsDefinition>,
    /// defineEmits 定义
    pub emits: Option<MacroEmitsDefinition>,
    /// defineExpose 定义
    pub expose: Option<MacroExposeDefinition>,
}

/// Props 定义
#[napi(object)]
pub struct MacroPropsDefinition {
    /// 原始源码
    pub source: String,
    /// 属性键列表
    pub keys: Vec<String>,
}

/// Emits 定义
#[napi(object)]
pub struct MacroEmitsDefinition {
    /// 原始源码
    pub source: String,
    /// 事件名列表
    pub events: Vec<String>,
}

/// Expose 定义
#[napi(object)]
pub struct MacroExposeDefinition {
    /// 原始源码
    pub source: String,
    /// 暴露的键列表
    pub keys: Vec<String>,
}

/// 编译 Web Component 宏
#[napi]
pub fn compile_web_component_macros(
    source: String,
    options: Option<WebComponentMacroOptions>,
) -> WebComponentMacroResult {
    let opts = options.unwrap_or(WebComponentMacroOptions {
        enable_macros: Some(true),
        auto_detect: Some(true),
        macro_module: None,
        preserve_macros: Some(false),
    });

    let wc_options = WebComponentCompilerOptions {
        base: CoreCompilerOptions {
            source_type: SourceType::default(),
            experimental: false,
        },
        enable_macros: opts.enable_macros.unwrap_or(true),
        auto_detect: opts.auto_detect.unwrap_or(true),
        macro_module: opts.macro_module,
        preserve_macros: opts.preserve_macros.unwrap_or(false),
    };

    let compiler = WebComponentCompiler::new();

    match compiler.compile(&source, &wc_options) {
        Ok(result) => {
            let macros = if result.macros_found {
                Some(WebComponentMacroDefinitions {
                    props: result.macros.props.map(|p| MacroPropsDefinition {
                        source: p.source,
                        keys: p.keys,
                    }),
                    emits: result.macros.emits.map(|e| MacroEmitsDefinition {
                        source: e.source,
                        events: e.events,
                    }),
                    expose: result.macros.expose.map(|ex| MacroExposeDefinition {
                        source: ex.source,
                        keys: ex.keys,
                    }),
                })
            } else {
                None
            };

            WebComponentMacroResult {
                code: result.code,
                macros_found: result.macros_found,
                macros,
            }
        }
        Err(_error) => {
            WebComponentMacroResult {
                code: source,
                macros_found: false,
                macros: None,
            }
        }
    }
}

/// 转换 Web Component 宏 (只返回转换后的代码)
#[napi]
pub fn transform_web_component_macros(
    source: String,
    options: Option<WebComponentMacroOptions>,
) -> String {
    let opts = options.unwrap_or(WebComponentMacroOptions {
        enable_macros: Some(true),
        auto_detect: Some(true),
        macro_module: None,
        preserve_macros: Some(false),
    });

    let wc_options = WebComponentCompilerOptions {
        base: CoreCompilerOptions {
            source_type: SourceType::default(),
            experimental: false,
        },
        enable_macros: opts.enable_macros.unwrap_or(true),
        auto_detect: opts.auto_detect.unwrap_or(true),
        macro_module: opts.macro_module,
        preserve_macros: opts.preserve_macros.unwrap_or(false),
    };

    let compiler = WebComponentCompiler::new();

    compiler.transform(&source, &wc_options).unwrap_or(source)
}
