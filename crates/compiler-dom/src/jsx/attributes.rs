//! JSX DOM 属性处理模块
//!
//! 提供属性分类和转换逻辑

use std::cell::Cell;

use oxc_allocator::{Allocator, CloneIn, Vec};
use oxc_ast::ast::*;
use oxc_span::GetSpan;
use oxc_span::{Ident, Str};
use oxc_syntax::node::NodeId;

use zeus_compiler_core::jsx::constants;
use zeus_compiler_core::jsx::ir::{AttrBinding, AttrBindingKind};
use zeus_compiler_core::jsx::state::JsxCompilerState;
use zeus_compiler_core::jsx::utils::{
    classify_attribute, is_event_attribute, is_static_value,
    evaluate_static_expr, CheckConfig,
};

/// 属性处理器
pub struct AttributeHandler<'a, 'ctx> {
    /// 内存分配器
    allocator: &'a Allocator,
    /// 编译器状态
    state: &'ctx mut JsxCompilerState<'a>,
    /// 元素 ID
    element_id: String,
    /// 是否为 SVG 元素
    is_svg: bool,
    /// 是否为自定义元素
    is_custom_element: bool,
}

impl<'a, 'ctx> AttributeHandler<'a, 'ctx> {
    /// 创建新的属性处理器
    pub fn new(
        allocator: &'a Allocator,
        state: &'ctx mut JsxCompilerState<'a>,
        element_id: String,
        is_svg: bool,
        is_custom_element: bool,
    ) -> Self {
        Self { allocator, state, element_id, is_svg, is_custom_element }
    }

    /// 处理属性列表，返回属性绑定列表
    pub fn handle_attributes(
        &mut self,
        attributes: &[JSXAttributeItem<'a>],
        template: &mut String,
    ) -> Vec<AttrBinding<'a>> {
        let mut bindings = Vec::new_in(self.allocator);

        // 1. 检测是否有 spread 属性
        let has_spread = attributes.iter().any(|attr| attr.as_spread().is_some());

        if has_spread {
            self.handle_spread(attributes, template);
            return bindings;
        }

        // 2. 预处理：合并多个 class 属性
        let merged = self.merge_class_attributes(attributes);

        // 3. 遍历处理每个属性
        for attr in merged.iter() {
            let binding = self.handle_attribute(attr, template);
            if let Some(binding) = binding {
                bindings.push(binding);
            }
        }

        bindings
    }

    /// 处理单个属性
    fn handle_attribute(
        &mut self,
        attr: &JSXAttributeItem<'a>,
        template: &mut String,
    ) -> Option<AttrBinding<'a>> {
        if let JSXAttributeItem::Attribute(attr) = attr {
            let name = attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
            let value_opt = attr.value.as_ref();

            // 解析命名空间
            let (namespace, attr_name) = crate::jsx::utils::parse_namespace(name);
            let kind = classify_attribute(attr_name, namespace, &self.element_id, self.is_svg);

            // 事件属性特殊处理
            if is_event_attribute(name) {
                return self.handle_event_attribute(name, value_opt, template);
            }

            // ref 属性特殊处理
            if kind == AttrBindingKind::Ref {
                return self.handle_ref_attribute(value_opt, template);
            }

            // 有值属性
            if let Some(value) = value_opt {
                if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                    let expr = &expr_container.expression;
                    let check_config = CheckConfig::default_dom();

                    let is_dynamic = is_dynamic_expression(expr, check_config);

                    if is_dynamic {
                        // 动态属性
                        if kind.needs_effect() {
                            // 需要 effect 包装的属性
                            return Some(AttrBinding {
                                name: attr_name.to_string(),
                                namespace: namespace.map(String::from),
                                expression: expr.clone_in(self.allocator),
                                kind,
                                is_static: false,
                            });
                        } else {
                            // 直接设置属性
                            self.generate_set_attr_code(template, attr_name, expr, kind);
                        }
                    } else {
                        // 静态值 → 内联到模板
                        self.inline_static_attribute(template, attr_name, expr);
                    }
                }
            } else {
                // 无值属性 (如 <div disabled />)
                if constants::is_boolean_attribute(attr_name) {
                    template.push(' ');
                    template.push_str(attr_name);
                    return Some(AttrBinding {
                        name: attr_name.to_string(),
                        namespace: None,
                        expression: self.bool_literal(true),
                        kind: AttrBindingKind::BoolAttribute,
                        is_static: true,
                    });
                }
            }
        }
        None
    }

    /// 处理事件属性
    fn handle_event_attribute(
        &mut self,
        name: &str,
        value_opt: Option<&JSXAttributeValue<'a>>,
        template: &mut String,
    ) -> Option<AttrBinding<'a>> {
        let event_name = crate::jsx::utils::to_event_name(name);
        let full_event_key = format!("${}", event_name);

        // 获取处理函数表达式
        let handler_expr = self.extract_handler_expression(value_opt)?;

        // 检测是否强制非委托模式
        let is_forced_direct = name.starts_with("on:");

        // 检测是否可委托
        let can_delegate = !is_forced_direct
            && self.state.config.delegate_events
            && constants::is_delegated_event(&event_name);

        if can_delegate {
            // 委托模式
            self.state.register_delegated_event(event_name.clone());
            self.state.register_helper("delegateEvents".to_string(), None);

            // 生成赋值表达式
            template.push_str(&format!(" el.{} = handler;", full_event_key));
        } else {
            // 非委托模式
            self.state.register_helper("addEventListener".to_string(), None);
            template.push_str(&format!(
                " el.addEventListener('{}', handler);",
                event_name
            ));
        }

        Some(AttrBinding {
            name: event_name,
            namespace: None,
            expression: handler_expr,
            kind: AttrBindingKind::Event,
            is_static: false,
        })
    }

    /// 处理 ref 属性
    fn handle_ref_attribute(
        &mut self,
        value_opt: Option<&JSXAttributeValue<'a>>,
        template: &mut String,
    ) -> Option<AttrBinding<'a>> {
        self.state.register_helper("use".to_string(), None);

        if let Some(value) = value_opt {
            if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                let elem_str = Str::from_in(&self.element_id, self.allocator);
                let handler = expr_container.expression.clone_in(self.allocator);

                // 生成: use(el, handler)
                template.push_str(&format!(
                    " use({}, handler_ref);",
                    self.element_id
                ));

                return Some(AttrBinding {
                    name: "ref".to_string(),
                    namespace: None,
                    expression: handler,
                    kind: AttrBindingKind::Ref,
                    is_static: false,
                });
            }
        }

        None
    }

    /// 提取处理函数表达式
    fn extract_handler_expression(&self, value_opt: Option<&JSXAttributeValue<'a>>) -> Option<Expression<'a>> {
        if let Some(value) = value_opt {
            if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                if !expr_container.expression.is_null_literal() {
                    return Some(expr_container.expression.clone());
                }
            }
        }
        None
    }

    /// 内联静态属性到模板
    fn inline_static_attribute(&self, template: &mut String, name: &str, expr: &Expression<'a>) {
        match expr {
            Expression::StringLiteral(s) => {
                template.push(' ');
                template.push_str(name);
                template.push_str("=\"");
                template.push_str(s.value.as_str());
                template.push('"');
            }
            Expression::BooleanLiteral(b) if b.value => {
                template.push(' ');
                template.push_str(name);
            }
            Expression::NumericLiteral(n) => {
                template.push(' ');
                template.push_str(name);
                template.push_str("=\"");
                template.push_str(&n.value.to_string());
                template.push('"');
            }
            _ => {}
        }
    }

    /// 生成设置属性的代码
    fn generate_set_attr_code(
        &self,
        template: &mut String,
        name: &str,
        expr: &Expression<'a>,
        kind: AttrBindingKind,
    ) {
        let elem = &self.element_id;

        match kind {
            AttrBindingKind::ClassName => {
                template.push_str(&format!(" className({}, {});", elem, self.expr_to_string(expr)));
            }
            AttrBindingKind::ClassList => {
                self.state.register_helper("classList".to_string(), None);
                template.push_str(&format!(" classList({}, {});", elem, self.expr_to_string(expr)));
            }
            AttrBindingKind::Style | AttrBindingKind::StyleProperty => {
                self.state.register_helper("style".to_string(), None);
                template.push_str(&format!(" style({}, {});", elem, self.expr_to_string(expr)));
            }
            _ => {
                template.push_str(&format!(
                    " setAttribute({}, '{}', {});",
                    elem, name, self.expr_to_string(expr)
                ));
            }
        }
    }

    /// 将表达式转换为字符串表示（简化版）
    fn expr_to_string(&self, expr: &Expression<'a>) -> String {
        // 这里应该使用 oxc_codegen 来生成代码
        // 简化版本返回占位符
        "<expr>".to_string()
    }

    /// 处理 Spread 属性
    fn handle_spread(&mut self, attributes: &[JSXAttributeItem<'a>], template: &mut String) {
        self.state.register_helper("spread".to_string(), None);
        self.state.register_helper("mergeProps".to_string(), None);

        let mut static_props = Vec::new_in(self.allocator);
        let mut spread_args = Vec::new_in(self.allocator);

        for attr in attributes {
            match attr {
                JSXAttributeItem::SpreadAttribute(spread) => {
                    spread_args.push(spread.argument.clone_in(self.allocator));
                }
                JSXAttributeItem::Attribute(normal_attr) => {
                    let name = normal_attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
                    if name == "class" || name == "className" {
                        // 收集 class 属性
                        if let Some(value) = normal_attr.value.as_ref() {
                            if let JSXAttributeValue::StringLiteral(s) = value {
                                static_props.push(s.value.as_str().to_string());
                            }
                        }
                    } else {
                        // 其他静态属性
                        if let Some(value) = normal_attr.value.as_ref() {
                            if let JSXAttributeValue::StringLiteral(s) = value {
                                template.push(' ');
                                template.push_str(name);
                                template.push_str("=\"");
                                template.push_str(s.value.as_str());
                                template.push('"');
                            }
                        }
                    }
                }
            }
        }

        // 生成 mergeProps 调用
        if !spread_args.is_empty() {
            template.push_str(" spread(mergeProps([");
            for (i, _) in spread_args.iter().enumerate() {
                if i > 0 {
                    template.push_str(", ");
                }
                template.push_str(&format!("_spread{}", i));
            }
            template.push_str("]));");
        }
    }

    /// 合并多个 class 属性
    #[allow(clippy::vec_box)]
    fn merge_class_attributes(&self, attributes: &[JSXAttributeItem<'a>]) -> Vec<'a, JSXAttributeItem<'a>> {
        let mut result: Vec<'a, JSXAttributeItem<'a>> = Vec::new_in(self.allocator);
        let mut class_values: Vec<String> = Vec::new();

        for attr in attributes {
            if let JSXAttributeItem::Attribute(normal_attr) = attr {
                let name = normal_attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
                if name == "class" || name == "className" {
                    if let Some(value) = normal_attr.value.as_ref() {
                        if let JSXAttributeValue::StringLiteral(s) = value {
                            class_values.push(s.value.as_str().to_string());
                            continue;
                        }
                    }
                }
            }
            result.push(attr.clone_in(self.allocator));
        }

        // 如果有多个 class 值，创建一个合并的属性
        if class_values.len() > 1 {
            // TODO: 创建合并的 class 属性
        }

        result
    }

    /// 创建布尔字面量
    fn bool_literal(&self, value: bool) -> Expression<'a> {
        Expression::BooleanLiteral(BooleanLiteral {
            value,
            span: GetSpan::SPAN,
            node_id: Cell::new(NodeId::DUMMY),
        })
    }
}

/// 检测属性值是否为动态
pub fn is_dynamic_value<'a>(expr: &Expression<'a>) -> bool {
    let config = CheckConfig::default_dom();
    is_dynamic_expression(expr, config)
}

/// 生成属性设置代码
pub fn generate_attr_code<'a>(
    element_id: &str,
    name: &str,
    value: &Expression<'a>,
    kind: AttrBindingKind,
    allocator: &'a Allocator,
) -> Expression<'a> {
    let elem_str = Str::from_in(element_id, allocator);
    let attr_name_str = Str::from_in(name, allocator);

    let args: Vec<'a, Argument<'a>> = match kind {
        AttrBindingKind::ClassName | AttrBindingKind::ClassList => {
            allocator.vec([elem_str.into(), value.clone().into()])
        }
        AttrBindingKind::Style | AttrBindingKind::StyleProperty => {
            allocator.vec([elem_str.into(), value.clone().into()])
        }
        AttrBindingKind::Prop => {
            allocator.vec([elem_str.into(), attr_name_str.into(), value.clone().into()])
        }
        _ => {
            allocator.vec([elem_str.into(), attr_name_str.into(), value.clone().into()])
        }
    };

    let helper_name = match kind {
        AttrBindingKind::ClassName => "className",
        AttrBindingKind::ClassList => "classList",
        AttrBindingKind::Style | AttrBindingKind::StyleProperty => "style",
        AttrBindingKind::Prop => "setProp",
        _ => "setAttribute",
    };

    Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(IdentifierReference {
            name: Ident::from_in(helper_name, allocator),
            span: GetSpan::SPAN,
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        }),
        arguments: args,
        span: GetSpan::SPAN,
        node_id: Cell::new(NodeId::DUMMY),
        optional: false,
        pure: false,
        type_arguments: None,
    })
}

/// 简化版的属性值转字符串（用于模板生成）
pub fn expr_to_code(expr: &Expression) -> String {
    match expr {
        Expression::StringLiteral(s) => format!("\"{}\"", s.value.as_str()),
        Expression::NumericLiteral(n) => n.value.to_string(),
        Expression::BooleanLiteral(b) => b.value.to_string(),
        Expression::Identifier(id) => id.name.to_string(),
        _ => "<expr>".to_string(),
    }
}
