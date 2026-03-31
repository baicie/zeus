//! 模板生成模块
//!
//! 负责从模板声明生成 HTML 模板字符串

/// 清理模板 HTML
/// 保留 <!--[数字]--> 注释作为 marker
/// 最小化空白以减少模板体积
pub fn cleanup_template_html(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let chars: Vec<char> = html.chars().collect();
    let len = chars.len();
    let mut i = 0;
    let mut in_tag = false;

    while i < len {
        let c = chars[i];

        // 检测 <!--[数字]--> 注释，保留作为 marker
        if i + 7 < len
            && chars[i] == '<'
            && chars[i + 1] == '!'
            && chars[i + 2] == '-'
            && chars[i + 3] == '-'
            && chars[i + 4] == '['
        {
            let mut j = i + 5;
            while j < len && chars[j].is_ascii_digit() {
                j += 1;
            }
            if j > i + 5 && j + 3 <= len
                && chars[j] == ']'
                && chars[j + 1] == '-'
                && chars[j + 2] == '-'
                && chars[j + 3] == '>'
            {
                result.push_str(&chars[i..=j + 3].iter().collect::<String>());
                i = j + 4;
                continue;
            }
        }

        if c == '<' {
            in_tag = true;
        } else if c == '>' {
            in_tag = false;
        }

        // 最小化空白
        if c.is_whitespace() && !in_tag {
            let prev = result.chars().last();
            let next = chars.get(i + 1);

            let should_keep = match (prev, next) {
                (Some('<'), _) | (_, Some('<')) => false,
                (Some('>'), Some(c)) if !c.is_whitespace() => true,
                (Some(c), Some('>')) if !c.is_whitespace() => true,
                (None, _) => false,
                _ => true,
            };

            if should_keep && !result.ends_with(' ') {
                result.push(' ');
            }
        } else if c != '\r' && c != '\t' {
            result.push(c);
        }

        i += 1;
    }

    // 清理连续空格
    let html = result;
    let mut result = String::new();
    let mut prev_was_space = false;

    for c in html.chars() {
        if c == ' ' {
            if !prev_was_space {
                result.push(c);
                prev_was_space = true;
            }
        } else {
            result.push(c);
            prev_was_space = false;
        }
    }

    result.trim().to_string()
}

/// 转义模板字符串
pub fn escape_template_string(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '\\' => result.push_str("\\\\"),
            '`' => result.push_str("\\`"),
            '$' => result.push_str("\\$"),
            '\n' => result.push_str("\\n"),
            '\r' => result.push_str("\\r"),
            '\t' => result.push_str("\\t"),
            _ => result.push(c),
        }
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cleanup_preserves_markers() {
        let html = "<div><!--[0]--></div>";
        let result = cleanup_template_html(html);
        assert!(result.contains("<!--[0]-->"));
    }

    #[test]
    fn test_cleanup_removes_extra_whitespace() {
        let html = "<div>  hello  </div>";
        let result = cleanup_template_html(html);
        assert!(result.contains("hello"));
    }

    #[test]
    fn test_escape_template() {
        assert_eq!(
            escape_template_string("<div class=\"test\">"),
            "<div class=\\\"test\\\">"
        );
    }
}
