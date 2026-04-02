//! 控制流转换模块
//!
//! 负责将条件语句转换为三元表达式等优化

use super::state::{DomCompilerState, TernaryTransform};
use oxc_ast::ast::{Expression, IfStatement, Statement};

/// 控制流分析器
pub struct ControlFlowAnalyzer<'a> {
    source: &'a str,
}

impl<'a> ControlFlowAnalyzer<'a> {
    /// 创建新的控制流分析器
    pub fn new(source: &'a str) -> Self {
        Self { source }
    }

    /// 检查是否应该转换为 ternary
    pub fn should_transform_to_ternary(&self, node: &IfStatement<'a>) -> bool {
        let test_str = self.expression_to_source(&node.test);
        let has_signal = test_str.contains("()");
        let then_returns_jsx = self.statement_returns_jsx(&node.consequent);
        let else_returns_jsx = node.alternate.as_ref()
            .map_or(false, |alt| self.statement_returns_jsx(alt));
        has_signal && then_returns_jsx && else_returns_jsx
    }

    /// 检查语句是否返回 JSX
    fn statement_returns_jsx(&self, stmt: &Statement<'a>) -> bool {
        match stmt {
            Statement::ReturnStatement(ret) => {
                ret.argument.as_ref().map_or(false, |arg| self.expression_is_jsx(arg))
            }
            Statement::BlockStatement(block) => {
                for s in block.body.iter().rev() {
                    if let Statement::ReturnStatement(r) = s {
                        if let Some(arg) = &r.argument {
                            return self.expression_is_jsx(arg);
                        }
                    }
                }
                false
            }
            Statement::IfStatement(if_stmt) => {
                self.statement_returns_jsx(&if_stmt.consequent)
                    && if_stmt.alternate.as_ref()
                        .map_or(true, |alt| self.statement_returns_jsx(alt))
            }
            _ => false,
        }
    }

    /// 检查表达式是否是 JSX
    fn expression_is_jsx(&self, expr: &Expression<'a>) -> bool {
        matches!(expr, Expression::JSXElement(_) | Expression::JSXFragment(_))
    }

    /// 提取 JSX 表达式的源代码
    fn extract_jsx_source(&self, stmt: &Statement<'a>) -> Option<String> {
        match stmt {
            Statement::ReturnStatement(ret) => {
                if let Some(arg) = &ret.argument {
                    if self.expression_is_jsx(arg) {
                        return Some(self.expression_to_source(arg));
                    }
                }
                None
            }
            Statement::BlockStatement(block) => {
                for s in block.body.iter().rev() {
                    if let Statement::ReturnStatement(r) = s {
                        if let Some(arg) = &r.argument {
                            if self.expression_is_jsx(arg) {
                                return Some(self.expression_to_source(arg));
                            }
                        }
                    }
                }
                None
            }
            Statement::IfStatement(if_stmt) => {
                let consequent = self.extract_jsx_source(&if_stmt.consequent)?;
                Some(consequent)
            }
            _ => None,
        }
    }

    /// 转换为 ternary 表达式
    /// 返回需要替换的语句信息（用于后续的 AST 替换）
    pub fn transform_to_ternary(
        &mut self,
        node: &IfStatement<'a>,
        state: &mut DomCompilerState,
    ) -> Option<TernaryTransform> {
        let test_str = self.expression_to_source(&node.test);

        let consequent_str = match self.extract_jsx_source(&node.consequent) {
            Some(s) => s,
            None => return None,
        };

        let alternate_str = node.alternate.as_ref()
            .and_then(|alt| self.extract_jsx_source(alt));

        let (ternary_code, wrapper) = if let Some(alternate) = alternate_str {
            // 有 else 分支，直接使用 ternary
            let code = format!("{} ? {} : {}", test_str, consequent_str, alternate);
            (code, None)
        } else {
            // 没有 else 分支，使用 yield_ 包装
            state.add_helper("yield_");
            let code = format!("yield_({} && {})", test_str, consequent_str);
            (code, Some("yield_"))
        };

        // 获取 if 语句在源码中的位置
        let if_span = node.span;

        Some(TernaryTransform {
            if_span,
            ternary_code,
            wrapper,
        })
    }

    /// 将表达式转换为源码字符串
    pub fn expression_to_source(&self, expr: &Expression) -> String {
        Self::_expression_to_source(expr)
    }

    /// 将表达式转换为源码字符串（静态方法，方便外部调用）
    pub fn _expression_to_source(expr: &Expression) -> String {
        match expr {
            Expression::Identifier(id) => id.name.to_string(),
            Expression::StringLiteral(s) => format!("\"{}\"", s.value),
            Expression::NumericLiteral(n) => n.value.to_string(),
            Expression::BooleanLiteral(b) => b.value.to_string(),
            Expression::NullLiteral(_) => "null".to_string(),
            Expression::TemplateLiteral(t) => {
                let mut result = String::new();
                for (i, quasi) in t.quasis.iter().enumerate() {
                    result.push_str(quasi.value.raw.as_str());
                    if i < t.expressions.len() {
                        result.push_str("${...}");
                    }
                }
                format!("`{}`", result)
            }
            Expression::ArrayExpression(arr) => {
                let elements: Vec<String> = arr
                    .elements
                    .iter()
                    .filter_map(|elem| elem.as_expression().map(|e| Self::_expression_to_source(e)))
                    .collect();
                format!("[{}]", elements.join(", "))
            }
            Expression::ObjectExpression(obj) => {
                let properties: Vec<String> = obj
                    .properties
                    .iter()
                    .filter_map(|prop| {
                        let p = prop.as_property()?;
                        Some(format!("{}: ...", Self::_expression_to_source(&p.value)))
                    })
                    .collect();
                format!("{{{}}}", properties.join(", "))
            }
            Expression::FunctionExpression(_) => "function() { /* body */ }".to_string(),
            Expression::ArrowFunctionExpression(arrow) => {
                if arrow.expression {
                    for stmt in &arrow.body.statements {
                        if let Statement::ExpressionStatement(expr_stmt) = stmt {
                            return Self::_expression_to_source(&expr_stmt.expression);
                        }
                    }
                }
                for stmt in &arrow.body.statements {
                    if let Statement::ReturnStatement(ret) = stmt {
                        if let Some(arg) = &ret.argument {
                            return Self::_expression_to_source(arg);
                        }
                    }
                }
                "/* body */".to_string()
            }
            Expression::ClassExpression(_) => "class { /* body */ }".to_string(),
            Expression::NewExpression(new) => {
                let callee = Self::_expression_to_source(&new.callee);
                format!("new {}", callee)
            }
            Expression::BinaryExpression(bin) => {
                let left = Self::_expression_to_source(&bin.left);
                let right = Self::_expression_to_source(&bin.right);
                let op = bin.operator.as_str();
                format!("({} {} {})", left, op, right)
            }
            Expression::UnaryExpression(unary) => {
                let arg = Self::_expression_to_source(&unary.argument);
                let op = unary.operator.as_str();
                format!("({}{})", op, arg)
            }
            Expression::UpdateExpression(_) => "/* update expr */".to_string(),
            Expression::LogicalExpression(logical) => {
                let left = Self::_expression_to_source(&logical.left);
                let right = Self::_expression_to_source(&logical.right);
                let op = logical.operator.as_str();
                format!("({} {} {})", left, op, right)
            }
            Expression::ConditionalExpression(cond) => {
                let test = Self::_expression_to_source(&cond.test);
                let consequent = Self::_expression_to_source(&cond.consequent);
                let alternate = Self::_expression_to_source(&cond.alternate);
                format!("({} ? {} : {})", test, consequent, alternate)
            }
            Expression::AssignmentExpression(assign) => {
                let right = Self::_expression_to_source(&assign.right);
                format!("/* assign */ {}", right)
            }
            Expression::SequenceExpression(seq) => {
                let exprs: Vec<String> = seq
                    .expressions
                    .iter()
                    .map(|e| Self::_expression_to_source(e))
                    .collect();
                format!("({})", exprs.join(", "))
            }
            Expression::AwaitExpression(_) => "/* await */".to_string(),
            Expression::YieldExpression(yield_) => {
                if let Some(arg) = &yield_.argument {
                    format!("yield* {}", Self::_expression_to_source(arg))
                } else {
                    "yield".to_string()
                }
            }
            Expression::ThisExpression(_) => "this".to_string(),
            Expression::Super(_) => "super".to_string(),
            Expression::ImportExpression(_) => "import(/* source */)".to_string(),
            Expression::ParenthesizedExpression(paren) => {
                Self::_expression_to_source(&paren.expression)
            }
            Expression::PrivateInExpression(_) => "/* private in */".to_string(),
            Expression::CallExpression(call) => {
                let callee = Self::_expression_to_source(&call.callee);
                let args: Vec<String> = call
                    .arguments
                    .iter()
                    .filter_map(|arg| arg.as_expression().map(|e| Self::_expression_to_source(e)))
                    .collect();
                format!("{}({})", callee, args.join(", "))
            }
            Expression::ChainExpression(_) => "/* chain expression */".to_string(),
            Expression::JSXElement(_) => "/* JSX element */".to_string(),
            Expression::JSXFragment(_) => "/* JSX fragment */".to_string(),
            _ => "/* expression */".to_string(),
        }
    }
}
