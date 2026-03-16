//! JSX 编译器模块

use std::marker::PhantomData;

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    CallExpression, Expression, FunctionBody, IdentifierReference, JSXElement, JSXElementName,
    JSXFragment, MemberExpression, Program, ReturnStatement, Statement,
};
use oxc_span::Span;
use oxc_traverse::ancestor::Ancestor;
use oxc_traverse::{TraverseCtx, TraverseMut, TraverseOptions};

use zeus_compiler_common::{
    Binding, BindingKind, CompilerOptions, CompileOutput, CompileResult, DomPath, TemplateDecl,
    TemplateIR, TraversalStep,
};

use crate::template_analyzer::TemplateAnalyzer;
use crate::template_ir::{DomTemplateIR, FragmentTemplateIR};

/// DOM 编译器状态
pub struct DomCompilerState {
    /// 模板计数器
    pub template_counter: usize,
    /// 收集的模板声明
    pub templates: Vec<TemplateDecl>,
    /// 委托事件列表
    pub delegated_events: Vec<String>,
    /// 使用的 helpers
    pub used_helpers: Vec<String>,
    /// 警告信息
    pub warnings: Vec<String>,
}

impl DomCompilerState {
    /// 创建新的编译器状态
    pub fn new() -> Self {
        Self {
            template_counter: 0,
            templates: Vec::new(),
            delegated_events: Vec::new(),
            used_helpers: Vec::new(),
            warnings: Vec::new(),
        }
    }

    /// 生成唯一的模板变量名
    pub fn generate_template_name(&mut self) -> String {
        let name = format!("_tmpl${}", self.template_counter);
        self.template_counter += 1;
        name
    }

    /// 添加模板声明
    pub fn add_template(&mut self, decl: TemplateDecl) {
        self.templates.push(decl);
    }

    /// 添加使用的 helper
    pub fn add_helper(&mut self, helper: &str) {
        if !self.used_helpers.contains(&helper.to_string()) {
            self.used_helpers.push(helper.to_string());
        }
    }

    /// 添加委托事件
    pub fn add_delegated_event(&mut self, event: &str) {
        if !self.delegated_events.contains(&event.to_string()) {
            self.delegated_events.push(event.to_string());
        }
    }
}

impl Default for DomCompilerState {
    fn default() -> Self {
        Self::new()
    }
}

/// DOM 编译器 Pass
pub struct DomCompilerPass<'a> {
    /// 编译器状态
    state: DomCompilerState,
    /// 源代码
    source: &'a str,
    /// 编译器选项
    options: CompilerOptions,
}

impl<'a> DomCompilerPass<'a> {
    /// 创建新的 DOM 编译器
    pub fn new(source: &'a str, options: CompilerOptions) -> Self {
        Self {
            state: DomCompilerState::new(),
            source,
            options,
        }
    }

    /// 创建使用默认选项的编译器
    pub fn new_with_defaults(source: &'a str) -> Self {
        Self::new(source, CompilerOptions::default())
    }

    /// 编译源代码
    pub fn compile(mut self, program: &mut Program<'a>) -> CompileOutput {
        // Run the traverse
        let ctx = TraverseOptions::new(program);
        ctx.traverse_mut(&mut TraverseAdapter(&mut self));

        // Generate output
        self.generate_output()
    }

    /// 编译字符串源代码
    pub fn compile_source(source: &str) -> CompileResult<CompileOutput> {
        let allocator = Allocator::default();
        let ret = oxc_parser::Parser::new(&allocator, source, oxc_span::SourceType::jsx()).parse();

        if let Some(errors) = ret.errors.into_iter().next() {
            let error = errors.with_source_code(source);
            return Err(zeus_compiler_common::CompileError::new(
                format!("Parse error: {}", error),
                error.span(),
            ));
        }

        let mut program = ret.program;
        let mut pass = Self::new_with_defaults(source);
        Ok(pass.compile(&mut program))
    }

    /// 生成编译输出
    fn generate_output(&mut self) -> CompileOutput {
        let mut output = CompileOutput::new(String::new());

        // Generate imports
        output.used_helpers = self.state.used_helpers.clone();
        output.delegated_events = self.state.delegated_events.clone();

        // Generate template declarations
        for template in &self.state.templates {
            output.code.push_str(&format!(
                "const {} = template(\"{}\");\n",
                template.name, template.html
            ));
        }

        // TODO: Generate remaining code

        output
    }

    /// 获取标签名
    fn get_tag_name(&self, name: &JSXElementName) -> String {
        match name {
            JSXElementName::Identifier(id) => id.name.clone(),
            JSXElementName::NamespacedName(name) => {
                format!("{}:{}", name.namespace.name, name.property.name)
            }
            JSXElementName::MemberExpression(expr) => {
                let mut parts = vec![expr.object.name.clone()];
                for prop in &expr.properties {
                    parts.push(prop.name.clone());
                }
                parts.join(".")
            }
        }
    }

    /// 检查是否为组件
    fn is_component(&self, name: &str) -> bool {
        name.chars().next().map_or(false, |c| c.is_uppercase())
    }

    /// 分析 JSX 元素
    fn analyze_element(&mut self, element: &JSXElement) -> DomTemplateIR {
        let mut analyzer = TemplateAnalyzer::new(self.source);
        let mut ir = analyzer.analyze_element(element);

        // Generate template name
        let template_name = self.state.generate_template_name();
        ir.base.template_var = template_name.clone();

        // Add template declaration
        let decl = ir.to_template_decl(&template_name);
        self.state.add_template(decl);

        // Track delegated events
        for binding in &ir.base.bindings {
            if let BindingKind::DelegatedEvent { event_name, .. } = &binding.kind {
                self.state.add_delegated_event(event_name);
            }
        }

        ir
    }

    /// 分析 JSX 片段
    fn analyze_fragment(&mut self, fragment: &JSXFragment) -> FragmentTemplateIR {
        let mut analyzer = TemplateAnalyzer::new(self.source);
        analyzer.analyze_fragment(fragment)
    }

    /// 将 JSX 元素转换为函数调用代码
    fn transform_element(&mut self, element: &JSXElement) -> String {
        let tag_name = self.get_tag_name(&element.opening_element.name);

        if self.is_component(&tag_name) {
            // Component: call the component function
            self.transform_component(element, &tag_name)
        } else {
            // DOM element: generate template() + insert() calls
            self.transform_dom_element(element, &tag_name)
        }
    }

    /// 转换组件
    fn transform_component(&mut self, element: &JSXElement, tag_name: &str) -> String {
        self.state.add_helper("template");

        let template_name = self.state.generate_template_name();
        let mut analyzer = TemplateAnalyzer::new(self.source);
        let ir = analyzer.analyze_element(element);

        // Generate template declaration
        let html = &ir.base.html;
        let code = format!("const {} = template(\"{}\");\n", template_name, html);

        // Add helper usage
        self.state.add_helper("template");

        code
    }

    /// 转换 DOM 元素
    fn transform_dom_element(&mut self, element: &JSXElement, tag_name: &str) -> String {
        let mut analyzer = TemplateAnalyzer::new(self.source);
        let ir = analyzer.analyze_element(element);

        // Add helper usage
        self.state.add_helper("template");
        if !ir.base.bindings.is_empty() {
            self.state.add_helper("insert");
        }

        // Generate element creation code
        let template_var = &ir.base.template_var;
        format!("{}()", template_var)
    }

    /// 将 JSX 元素转换为表达式
    fn jsx_element_to_expression(&mut self, element: &JSXElement) -> Expression {
        let code = self.transform_element(element);

        // Create a simple call expression: template()
        // This is a simplified version - full implementation would parse the code back
        Expression::Call(CallExpression {
            span: element.span,
            callee: oxc_ast::ast::Callee::Import(
                oxc_ast::ast::ImportCallExpression {
                    span: Span::default(),
                    argument: Box::new(Expression::StringLiteral(
                        oxc_ast::ast::StringLiteral {
                            span: Span::default(),
                            value: self.options.runtime_module.as_deref().unwrap_or("@zeus-js/core").into(),
                            raw: None,
                        },
                    )),
                    optional: false,
                },
            ),
            arguments: vec![],
            optional: false,
        })
    }
}

/// Traverse adapter to work with oxc_traverse
struct TraverseAdapter<'a, 'b>(&'b mut DomCompilerPass<'a>);

impl<'a, 'b> TraverseMut for TraverseAdapter<'a, 'b> {
    type State = DomCompilerState;

    fn build_context(
        &self,
        _program: &Program<'a>,
        _allocator: &'b Allocator,
    ) -> Self::State {
        DomCompilerState::new()
    }

    fn enter_jsx_element(
        &mut self,
        node: &mut JSXElement<'a>,
        ctx: &mut TraverseCtx<'a, Self::State>,
    ) {
        // Analyze and transform JSX element
        let ir = self.0.analyze_element(node);
        let template_var = ir.base.template_var.clone();

        // For now, just generate the code string
        // Full AST replacement would require using AstBuilder
        let code = format!("{}()", template_var);

        // Add to state
        ctx.state.add_helper("template");

        // TODO: Replace the node with the generated expression
    }

    fn enter_jsx_fragment(
        &mut self,
        node: &mut JSXFragment<'a>,
        ctx: &mut TraverseCtx<'a, Self::State>,
    ) {
        let _ = self.0.analyze_fragment(node);
        // TODO: Handle fragment transformation
    }

    fn enter_if_statement(
        &mut self,
        node: &mut oxc_ast::ast::IfStatement<'a>,
        ctx: &mut TraverseCtx<'a, Self::State>,
    ) {
        // Check if should transform to ternary
        // This would require deeper analysis
        let _ = (node, ctx);
    }
}

/// 编译 JSX 源代码
pub fn compile(source: &str) -> CompileResult<CompileOutput> {
    DomCompilerPass::compile_source(source)
}

/// 编译 JSX 源代码（带选项）
pub fn compile_with_options(source: &str, options: CompilerOptions) -> CompileResult<CompileOutput> {
    let allocator = Allocator::default();
    let ret = oxc_parser::Parser::new(&allocator, source, oxc_span::SourceType::jsx()).parse();

    if let Some(errors) = ret.errors.into_iter().next() {
        let error = errors.with_source_code(source);
        return Err(zeus_compiler_common::CompileError::new(
            format!("Parse error: {}", error),
            error.span(),
        ));
    }

    let mut program = ret.program;
    let mut pass = DomCompilerPass::new(source, options);
    Ok(pass.compile(&mut program))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compile_simple() {
        let source = r#"<div>Hello</div>"#;
        let result = compile(source);
        assert!(result.is_ok());
        let output = result.unwrap();
        assert!(!output.code.is_empty());
    }

    #[test]
    fn test_compile_with_event() {
        let source = r#"<button onClick={handler}>Click</button>"#;
        let result = compile(source);
        assert!(result.is_ok());
    }

    #[test]
    fn test_compile_dynamic_content() {
        let source = r#"<div>{message()}</div>"#;
        let result = compile(source);
        assert!(result.is_ok());
    }
}
