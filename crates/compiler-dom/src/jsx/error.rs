//! 错误处理模块
//!
//! 提供编译器错误诊断功能

use oxc_diagnostics::OxcDiagnostic;

/// 从字节偏移计算行列号
pub fn offset_to_line_col(source: &str, offset: usize) -> (usize, usize) {
    let mut line = 1;
    let mut col = 1;
    let mut byte_count = 0;

    for ch in source.chars() {
        if byte_count >= offset {
            break;
        }
        if ch == '\n' {
            line += 1;
            col = 1;
        } else {
            col += 1;
        }
        byte_count += ch.len_utf8();
    }

    (line, col)
}

/// 格式化错误消息，包含行列号
pub fn format_diagnostic_errors(errors: &[OxcDiagnostic], source: &str) -> String {
    let mut messages = Vec::new();

    for diag in errors {
        let error_code = diag.code.to_string();
        let code_part = if error_code.is_empty() {
            String::new()
        } else {
            format!("[{}] ", error_code)
        };

        let location_info = if let Some(labels) = &diag.labels {
            let mut parts = Vec::new();
            for label in labels {
                let span = label.inner();
                let start = span.offset();
                let end = start + span.len();
                let (line, col) = offset_to_line_col(source, start);

                let line_idx = line.saturating_sub(1);
                let line_content = source.lines().nth(line_idx).unwrap_or("");
                let label_text = label.label().unwrap_or("");

                let underline_len = (end - start).min(50).max(1);
                let underline = format!(
                    "{}{}",
                    " ".repeat((col - 1).max(0) as usize),
                    "^".repeat(underline_len)
                );

                if label_text.is_empty() {
                    parts.push(format!(
                        "  --> :{}:{}\n     | {}\n     | {}",
                        line, col, line_content, underline
                    ));
                } else {
                    parts.push(format!(
                        "  --> :{}:{}\n     | {}\n     | {}\n     = {}",
                        line, col, line_content, underline, label_text
                    ));
                }
            }
            parts.join("\n")
        } else {
            String::new()
        };

        if location_info.is_empty() {
            messages.push(format!("{}{}", code_part, diag.message));
        } else {
            messages.push(format!("{}{}\n{}", code_part, diag.message, location_info));
        }
    }

    messages.join("\n\n")
}
