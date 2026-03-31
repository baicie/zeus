//! JSX 编译器工具函数模块
//!
//! 提供动态性检测、HTML 转义、空白处理等工具函数

use crate::jsx::constants;
use oxc_ast::ast::*;

/// 动态性检测配置
#[derive(Debug, Clone, Default)]
pub struct CheckConfig {
    /// 是否检查成员访问
    pub check_member: bool,
    /// 是否检查 JSX 标签
    pub check_tags: bool,
    /// 是否检查函数调用
    pub check_call_expressions: bool,
    /// SSR 模式 (禁用某些检查)
    pub native: bool,
}

impl CheckConfig {
    /// DOM 模式默认配置
    pub fn default_dom() -> Self {
        Self {
            check_member: true,
            check_tags: true,
            check_call_expressions: true,
            native: false,
        }
    }

    /// SSR 模式默认配置
    pub fn ssr() -> Self {
        Self {
            check_member: false,
            check_tags: true,
            check_call_expressions: false,
            native: true,
        }
    }
}

/// 检测表达式是否为动态（基于 AST 类型和配置）
pub fn is_dynamic_expression<'a>(expr: &Expression<'a>, config: CheckConfig) -> bool {
    // 函数表达式 → 静态
    if matches!(
        expr,
        Expression::FunctionExpression(_)
            | Expression::ArrowFunctionExpression(_)
            | Expression::ClassExpression(_)
    ) {
        return false;
    }

    // 静态标记 → 静态
    if let Expression::TaggedTemplateExpression(tag) = expr {
        if let Expression::Identifier(ident) = &tag.tag {
            if ident.name.as_str() == "@once" {
                return false;
            }
        }
        if config.check_call_expressions {
            return true;
        }
    }

    // 调用表达式 → 动态 (包括普通调用和可选链调用)
    if expr.is_call_expression() || matches!(expr, Expression::ChainExpression(_)) {
        return config.check_call_expressions;
    }

    // 成员访问 → 动态
    if expr.is_member_expression() {
        return config.check_member;
    }

    // JSX → 动态
    if expr.is_jsx() {
        return config.check_tags;
    }

    // 关键字 → 静态
    if matches!(
        expr,
        Expression::ThisExpression(_)
            | Expression::Super(_)
            | Expression::MetaProperty(_)
    ) {
        return false;
    }

    // 字面量 → 静态
    if expr.is_literal() {
        return false;
    }

    // 二元/一元/三元 → 递归检测操作数
    if let Expression::BinaryExpression(bin) = expr {
        return is_dynamic_expression(&bin.left, config.clone())
            || is_dynamic_expression(&bin.right, config.clone());
    }
    if let Expression::UnaryExpression(unary) = expr {
        return is_dynamic_expression(&unary.argument, config.clone());
    }
    if let Expression::ConditionalExpression(cond) = expr {
        return is_dynamic_expression(&cond.test, config.clone())
            || is_dynamic_expression(&cond.consequent, config.clone())
            || is_dynamic_expression(&cond.alternate, config.clone());
    }
    if let Expression::LogicalExpression(logical) = expr {
        return is_dynamic_expression(&logical.left, config.clone())
            || is_dynamic_expression(&logical.right, config.clone());
    }

    // 数组 → 检测任意元素
    if let Expression::ArrayExpression(arr) = expr {
        return arr.elements.iter().any(|e| {
            if let Some(expr) = e.as_expression() {
                is_dynamic_expression(expr, config.clone())
            } else {
                false
            }
        });
    }

    // 对象 → 检测属性值
    if let Expression::ObjectExpression(obj) = expr {
        return obj.properties.iter().any(|p| {
            match p {
                ObjectPropertyKind::ObjectProperty(prop) => {
                    is_dynamic_expression(&prop.value, config.clone())
                }
                ObjectPropertyKind::SpreadProperty(spread) => {
                    is_dynamic_expression(&spread.argument, config.clone())
                }
            }
        });
    }

    // 模板字符串 → 检测表达式部分
    if let Expression::TemplateLiteral(tmpl) = expr {
        return tmpl.expressions.iter().any(|e| {
            is_dynamic_expression(e, config.clone())
        });
    }

    // 其他 → 保守地视为动态
    true
}

/// HTML 转义
pub fn escape_html(s: &str, for_attr: bool) -> String {
    let mut result = String::with_capacity(s.len());

    for ch in s.chars() {
        match ch {
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '&' => result.push_str("&amp;"),
            '"' if for_attr => result.push_str("&quot;"),
            '\'' if for_attr => result.push_str("&#39;"),
            '\n' if !for_attr => result.push_str("&#10;"),
            '\r' => {}
            c => result.push(c),
        }
    }

    result
}

/// 规范化空白文本
pub fn normalize_whitespace(text: &str) -> String {
    let text = text.replace('\r', "");

    if text.contains('\n') {
        text.split('\n')
            .enumerate()
            .map(|(i, line)| {
                if i == 0 {
                    line.trim_end()
                } else {
                    line.trim_start()
                }
            })
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }
}

/// 过滤无用的 JSX 子节点
pub fn is_useless_child(child: &JSXChild) -> bool {
    match child {
        JSXChild::ExpressionContainer(expr) => {
            matches!(expr.expression, JSXExpression::EmptyExpression(_))
        }
        JSXChild::Text(text) => text.value.chars().all(|c| c.is_whitespace()),
        _ => false,
    }
}

/// 将 JSX 事件属性名转换为 DOM 事件名
pub fn to_event_name(name: &str) -> String {
    if name.len() > 2 && name.starts_with("on") {
        name[2..].to_lowercase()
    } else {
        name.to_lowercase()
    }
}

/// 检测标签名是否表示组件
pub fn is_component(tag_name: &str) -> bool {
    if let Some(c) = tag_name.chars().next() {
        if c.is_uppercase() {
            return true;
        }
    }
    if tag_name.contains('.') {
        return true;
    }
    if let Some(c) = tag_name.chars().next() {
        if !c.is_alphabetic() {
            return true;
        }
    }
    false
}

/// 检测是否为 SVG 元素
pub fn is_svg_element(tag_name: &str) -> bool {
    constants::is_svg_element(tag_name)
}

/// 检测是否为 void 元素
pub fn is_void_element(tag_name: &str) -> bool {
    constants::is_void_element(tag_name)
}

/// 检测是否为自定义元素
pub fn is_custom_element(tag_name: &str) -> bool {
    tag_name.contains('-')
}

/// 检测是否为保留的命名空间前缀
pub fn is_reserved_namespace(ns: &str) -> bool {
    constants::is_reserved_namespace(ns)
}

/// 解析命名空间前缀
pub fn parse_namespace(name: &str) -> (Option<&str>, &str) {
    if let Some(idx) = name.find(':') {
        let (ns, attr) = name.split_at(idx);
        if is_reserved_namespace(ns) {
            return (Some(ns), &attr[1..]);
        }
    }
    (None, name)
}

/// 获取 JSX 元素的标签名
pub fn get_jsx_tag_name(name: &JSXElementName) -> String {
    match name {
        JSXElementName::Identifier(id) => id.name.to_string(),
        JSXElementName::NamespacedName(ns) => {
            format!("{}:{}", ns.namespace.name, ns.name.name)
        }
        _ => "div".to_string(),
    }
}

/// 分类属性类型
pub fn classify_attribute(
    name: &str,
    namespace: Option<&str>,
    tag_name: &str,
    is_svg: bool,
) -> crate::jsx::ir::AttrBindingKind {
    let kind = if name.starts_with("on") && !name.contains(':') {
        crate::jsx::ir::AttrBindingKind::Event
    } else if name == "ref" {
        crate::jsx::ir::AttrBindingKind::Ref
    } else if let Some(ns) = namespace {
        match ns {
            "style" => crate::jsx::ir::AttrBindingKind::StyleProperty,
            "class" => crate::jsx::ir::AttrBindingKind::ClassToggle,
            "bool" => crate::jsx::ir::AttrBindingKind::BoolAttribute,
            "attr" => crate::jsx::ir::AttrBindingKind::ForceAttribute,
            "prop" => crate::jsx::ir::AttrBindingKind::Prop,
            "use" => crate::jsx::ir::AttrBindingKind::Use,
            _ => crate::jsx::ir::AttrBindingKind::Attribute,
        }
    } else if name == "classList" {
        crate::jsx::ir::AttrBindingKind::ClassList
    } else if name == "style" {
        crate::jsx::ir::AttrBindingKind::Style
    } else if name == "class" || name == "className" {
        crate::jsx::ir::AttrBindingKind::ClassName
    } else if constants::is_child_property(name) {
        crate::jsx::ir::AttrBindingKind::Property
    } else if !is_svg && constants::is_dom_property(name) {
        crate::jsx::ir::AttrBindingKind::Property
    } else {
        crate::jsx::ir::AttrBindingKind::Attribute
    };
    let _ = tag_name;
    kind
}

/// 检测处理函数类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandlerType {
    /// 静态函数
    StaticFunction,
    /// 可解析的 const 声明
    Resolvable,
    /// 数组形式 [handler, data]
    Array,
    /// 动态表达式
    Dynamic,
}

impl HandlerType {
    /// 从表达式检测处理函数类型
    #[allow(dead_code)]
    pub fn detect(expr: &Expression) -> Self {
        if matches!(
            expr,
            Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_)
        ) {
            return Self::StaticFunction;
        }
        if let Expression::ArrayExpression(arr) = expr {
            if !arr.elements.is_empty() {
                return Self::Array;
            }
        }
        Self::Dynamic
    }
}

/// 检测元素是否需要 importNode
#[allow(dead_code)]
pub fn needs_import_node(tag_name: &str, has_loading_attr: bool) -> bool {
    constants::is_import_node_element(tag_name) && has_loading_attr
}
