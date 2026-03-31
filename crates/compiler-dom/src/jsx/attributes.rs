//! JSX DOM 属性处理模块
//!
//! 提供属性分类和转换逻辑

use zeus_compiler_core::jsx::state::JsxCompilerState;
use zeus_compiler_core::jsx::constants;
use zeus_compiler_core::jsx::utils::classify_attribute;
use zeus_compiler_core::jsx::ir::AttrBindingKind;
use oxc_allocator::{Allocator, CloneIn};
use oxc_ast::ast::*;
use oxc_span::GetSpan;
use oxc_span::{Ident, Str};

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

    /// 处理属性列表
    pub fn handle_attributes(
        &mut self,
        attributes: &[JSXAttributeItem<'a>],
    ) -> Vec<AttrBinding<'a>> {
        let mut bindings = Vec::new();

        let has_spread = attributes.iter().any(|attr| attr.as_spread().is_some());

        if has_spread {
            self.handle_spread(attributes);
        }

        let merged = self.merge_class_attributes(attributes);

        for attr in merged.iter() {
            let binding = self.handle_attribute(attr);
            if let Some(binding) = binding {
                bindings.push(binding);
            }
        }

        bindings
    }

    /// 处理单个属性
    fn handle_attribute(&mut self, attr: &JSXAttributeItem<'a>) -> Option<AttrBinding<'a>> {
        if let JSXAttributeItem::Attribute(attr) = attr {
            let name = attr.name.as_identifier().name.as_str();
            let value_opt = attr.value.as_ref();

            let (namespace, attr_name) = crate::jsx::utils::parse_namespace(name);
            let kind = classify_attribute(attr_name, namespace, "", self.is_svg);

            if let Some(value) = value_opt {
                if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                    let expr = &expr_container.expression;

                    return Some(AttrBinding {
                        name: attr_name.to_string(),
                        namespace: namespace.map(String::from),
                        expression: expr.clone(),
                        kind,
                        is_static: false,
                    });
                }
            } else {
                if constants::is_boolean_attribute(attr_name) {
                    return Some(AttrBinding {
                        name: attr_name.to_string(),
                        namespace: None,
                        expression: Expression::BooleanLiteral(BooleanLiteral { value: true, span: Default::default(), node_id: Default::default() }),
                        kind: AttrBindingKind::BoolAttribute,
                        is_static: true,
                    });
                }
            }
        }
        None
    }

    /// 处理 Spread 属性
    fn handle_spread(&mut self, _attributes: &[JSXAttributeItem<'a>]) {
        self.state.register_helper("spread".to_string(), None);
        self.state.register_helper("mergeProps".to_string(), None);
    }

    /// 合并多个 class 属性
    #[allow(clippy::vec_box)]
    fn merge_class_attributes(&self, attributes: &[JSXAttributeItem<'a>]) -> Vec<JSXAttributeItem<'a>> {
        let mut result = Vec::new();
        let mut class_values: Vec<String> = Vec::new();

        for attr in attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = attr.name.as_identifier().name.as_str();
                if name == "class" || name == "className" {
                    if let Some(value) = attr.value.as_ref() {
                        if let JSXAttributeValue::StringLiteral(s) = value {
                            class_values.push(s.value.as_str().to_string());
                            continue;
                        }
                    }
                }
            }
            result.push(attr.clone());
        }

        result
    }
}

/// 创建 IdentifierReference
fn ident_ref<'a>(name: &str, allocator: &'a Allocator) -> IdentifierReference<'a> {
    IdentifierReference {
        name: Ident::from_in(name, allocator),
        span: Default::default(),
        node_id: Default::default(),
        reference_id: Default::default(),
    }
}

/// 创建 CallExpression
fn make_call<'a>(name: &str, args: Vec<Argument<'a>>, allocator: &'a Allocator) -> Expression<'a> {
    Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(ident_ref(name, allocator)),
        arguments: allocator.vec(args),
        span: Default::default(),
        node_id: Default::default(),
        optional: false,
        pure: false,
    })
}

/// 检测属性值是否为动态
pub fn is_dynamic_value<'a>(expr: &Expression<'a>) -> bool {
    let config = crate::jsx::utils::CheckConfig::default_dom();
    crate::jsx::utils::is_dynamic_expression(expr, config)
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

    match kind {
        AttrBindingKind::ClassName => {
            make_call("className", vec![elem_str.into(), value.clone().into()], allocator)
        }
        AttrBindingKind::ClassList => {
            make_call("classList", vec![elem_str.into(), value.clone().into()], allocator)
        }
        AttrBindingKind::Style | AttrBindingKind::StyleProperty => {
            make_call("style", vec![elem_str.into(), value.clone().into()], allocator)
        }
        AttrBindingKind::Ref => {
            make_call("use", vec![elem_str.into(), value.clone().into()], allocator)
        }
        AttrBindingKind::Prop => {
            make_call("setProp", vec![elem_str.into(), attr_name_str.into(), value.clone().into()], allocator)
        }
        _ => {
            make_call("setAttribute", vec![elem_str.into(), attr_name_str.into(), value.clone().into()], allocator)
        }
    }
}
