//! 空白处理模块
//!
//! 提供模板 HTML 和 JSX 文本的空白规范化功能

/// 清理模板 HTML 中不必要的注释和空白
/// 移除运行时不需要的注释，最小化空白以减少模板体积
pub fn cleanup_template_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let chars: Vec<char> = html.chars().collect();
    let len = chars.len();
    let mut i = 0;

    while i < len {
        // 检测并移除 <!----> 格式的空注释
        if i + 7 < len
            && chars[i] == '<'
            && chars[i + 1] == '!'
            && chars[i + 2] == '-'
            && chars[i + 3] == '-'
            && chars[i + 4] == '-'
            && chars[i + 5] == '-'
            && chars[i + 6] == '>'
        {
            // 空注释，跳过
            i += 7;
            continue;
        }

        result.push(chars[i]);
        i += 1;
    }

    result
}

/// 检测文本是否只包含空白
pub fn is_whitespace_only(text: &str) -> bool {
    text.chars().all(|c| c.is_whitespace())
}

/// 移除文本前后的空白
pub fn trim_whitespace(text: &str) -> &str {
    text.trim()
}

/// 规范化 JSX 中的空白文本
/// - 移除只包含空白和换行的行（行首空白）
/// - 将连续空白合并为单个空格
/// - 保留有意义的空白（如标签之间的空格）
pub fn normalize_jsx_whitespace(text: &str) -> String {
    let text = text.replace("\r\n", "\n").replace('\r', "\n");

    if text.contains('\n') {
        // 多行文本：移除只有空白的行，并规范化
        let result: Vec<&str> = text
            .lines()
            .enumerate()
            .filter_map(|(i, line)| {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    None
                } else if i == 0 {
                    // 第一行只去除尾部空白
                    Some(line.trim_end())
                } else {
                    // 其他行去除首尾空白
                    Some(trimmed)
                }
            })
            .collect();

        if result.len() <= 1 {
            result.first().map(|s| s.to_string()).unwrap_or_default()
        } else {
            // 多行有意义的内容，用单个空格连接
            result.join(" ")
        }
    } else {
        // 单行文本：去除首尾空白
        text.trim().to_string()
    }
}

/// 检测是否应该保留空白
/// 如果文本周围有非空白内容，返回 true
pub fn should_preserve_whitespace(before: Option<char>, after: Option<char>) -> bool {
    match (before, after) {
        (Some(c1), Some(c2)) => !c1.is_whitespace() && !c2.is_whitespace(),
        (Some(c), None) | (None, Some(c)) => !c.is_whitespace(),
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cleanup_template_html_preserves_markers() {
        let html = "<div><!--[0]--></div>";
        let result = cleanup_template_html(html);
        assert!(result.contains("<!--[0]-->"));
    }

    #[test]
    fn test_cleanup_template_html_removes_empty_comments() {
        let html = "<div><!----></div>";
        let result = cleanup_template_html(html);
        assert!(!result.contains("<!---->"));
    }

    #[test]
    fn test_is_whitespace_only() {
        assert!(is_whitespace_only("   \n\t  "));
        assert!(!is_whitespace_only("hello"));
    }

    #[test]
    fn test_normalize_jsx_whitespace_multiline() {
        let text = "hello\n  world\n  ";
        let result = normalize_jsx_whitespace(text);
        assert_eq!(result, "hello world");
    }

    #[test]
    fn test_normalize_jsx_whitespace_single_line() {
        let text = "  hello  ";
        let result = normalize_jsx_whitespace(text);
        assert_eq!(result, "hello");
    }
}
