//! JSX DOM 水合支持模块
//!
//! 提供水合相关的模板和处理逻辑

use zeus_compiler_core::jsx::ir::{MarkerKind, TemplateDecl};
use zeus_compiler_core::jsx::state::JsxCompilerState;
use oxc_allocator::{Allocator, CloneIn};
use oxc_ast::ast::*;
use oxc_span::{Ident, Str};

/// 水合处理生成器
pub struct HydrationGenerator<'a> {
    /// 内存分配器
    allocator: &'a Allocator,
}

impl<'a> HydrationGenerator<'a> {
    /// 创建新的水合生成器
    pub fn new(allocator: &'a Allocator) -> Self {
        Self { allocator }
    }

    /// 创建 IdentifierReference
    fn ident_ref(&self, name: &str) -> IdentifierReference<'a> {
        IdentifierReference {
            name: Ident::from_in(name, self.allocator),
            span: Default::default(),
            node_id: Default::default(),
            reference_id: Default::default(),
        }
    }

    /// 创建 CallExpression
    fn call(&self, callee: IdentifierReference<'a>, args: Vec<Argument<'a>>) -> Expression<'a> {
        Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(callee),
            arguments: self.allocator.vec(args),
            span: Default::default(),
            node_id: Default::default(),
            optional: false,
            pure: false,
        })
    }

    /// 生成水合兼容的模板声明
    pub fn generate_hydration_template(
        &self,
        tmpl: &TemplateDecl<'a>,
        state: &mut JsxCompilerState<'a>,
    ) -> Vec<Statement<'a>> {
        // 1. 注册 getNextElement helper
        state.register_helper("getNextElement".to_string(), None);

        // 2. 添加水合标记到模板 HTML
        let hydrated_html = self.add_hydration_markers(&tmpl.html);

        // 3. 生成模板声明
        let template_call = self.call(
            self.ident_ref("template"),
            vec![Expression::TemplateLiteral(TemplateLiteral {
                node_id: Default::default(),
                span: Default::default(),
                quasis: self.allocator.alloc([TemplateElement {
                    node_id: Default::default(),
                    span: Default::default(),
                    tail: true,
                    value: TemplateElementValue {
                        cooked: hydrated_html.clone(),
                        raw: hydrated_html,
                    },
                }]),
                expressions: self.allocator.vec([]),
            }).into()],
        );

        let pure_template = self.add_pure_annotation(template_call);

        let elem_name = format!("_el${}", state.element_counter);
        state.element_counter += 1;

        // 4. 生成 getNextElement 调用
        let element_call = self.call(self.ident_ref("getNextElement"), vec![pure_template.into()]);

        vec![
            Statement::VariableDeclaration(Box::new(VariableDeclaration {
                node_id: Default::default(),
                span: Default::default(),
                kind: VariableDeclarationKind::Const,
                declare: false,
                declarations: self.allocator.vec([VariableDeclarator {
                    node_id: Default::default(),
                    span: Default::default(),
                    id: BindingIdentifier {
                        name: Ident::from_in(tmpl.name.as_str(), self.allocator),
                        span: Default::default(),
                        node_id: Default::default(),
                        symbol_id: Default::default(),
                    },
                    init: Some(pure_template.into()),
                    definite: false,
                    kind: VariableDeclarationKind::Const,
                }]),
            })),
            Statement::VariableDeclaration(Box::new(VariableDeclaration {
                node_id: Default::default(),
                span: Default::default(),
                kind: VariableDeclarationKind::Var,
                declare: false,
                declarations: self.allocator.vec([VariableDeclarator {
                    node_id: Default::default(),
                    span: Default::default(),
                    id: BindingIdentifier {
                        name: Ident::from_in(&elem_name, self.allocator),
                        span: Default::default(),
                        node_id: Default::default(),
                        symbol_id: Default::default(),
                    },
                    init: Some(element_call.into()),
                    definite: false,
                    kind: VariableDeclarationKind::Var,
                }]),
            })),
        ]
    }

    /// 添加水合标记到 HTML
    fn add_hydration_markers(&self, html: &str) -> String {
        let mut result = String::with_capacity(html.len() + 100);
        let mut chars = html.chars().peekable();

        while let Some(ch) = chars.next() {
            result.push(ch);

            if ch == '<' && chars.peek() == Some(&'!') {
                let mut comment = String::from("!");
                chars.next();

                if chars.peek() == Some(&'-') {
                    comment.push('-');
                    chars.next();

                    if chars.peek() == Some(&'-') {
                        comment.push('-');
                        chars.next();

                        if let Some(&next) = chars.peek().copied() {
                            if next == '[' || next == '/' {
                                comment.push(next);
                                chars.next();

                                let mut digits = String::new();
                                while let Some(&c) = chars.peek().copied() {
                                    if c.is_ascii_digit() {
                                        digits.push(c);
                                        chars.next();
                                    } else {
                                        break;
                                    }
                                }

                                let mut tail = String::new();
                                for expected in [']', '-', '-', '>'] {
                                    if let Some(&c) = chars.peek().copied() {
                                        if c == expected {
                                            tail.push(c);
                                            chars.next();
                                        } else {
                                            break;
                                        }
                                    }
                                }

                                if !digits.is_empty() && tail == "]-->" {
                                    result.push_str(&format!(
                                        "{}{}{}{}{}",
                                        MarkerKind::HydrationStart.to_html(None),
                                        digits,
                                        tail,
                                        MarkerKind::HydrationEnd.to_html(None),
                                        ""
                                    ));
                                    continue;
                                } else {
                                    result.push_str(&digits);
                                    result.push_str(&tail);
                                    continue;
                                }
                            }
                        }
                    }
                }
            }
        }

        result
    }

    /// 添加纯函数注释
    fn add_pure_annotation(&self, expr: Expression<'a>) -> Expression<'a> {
        Expression::SequenceExpression(SequenceExpression {
            expressions: self.allocator.vec([
                Expression::UnaryExpression(UnaryExpression {
                    node_id: Default::default(),
                    operator: UnaryOperator::Typeof,
                    argument: Box::new(Expression::Identifier(self.ident_ref("undefined"))),
                    span: Default::default(),
                }),
                expr,
            ]),
            span: Default::default(),
        })
    }

    /// 生成水合数据属性
    pub fn generate_hydration_key(&self, index: usize) -> String {
        format!("data-hk=\"{}\"", index)
    }
}
