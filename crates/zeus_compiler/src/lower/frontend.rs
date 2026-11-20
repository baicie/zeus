//! Frontend facts: what the parsed program contains.
//!
//! These walk the AST and answer questions lowering will ask — which names are
//! builtins, which calls pass through `defineElement`, where `render` is called,
//! whether the module manages its own hot boundary. They read the program and
//! return data; none of them touches the lowerer or produces IR.
//!
//! This is the "Frontend" stage from AGENTS.md §5, kept apart from lowering so
//! a change to "what counts as a builtin?" is reviewable without reading the
//! JSX transformation it feeds.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    ArrowFunctionExpression, AwaitExpression, BindingPattern, Class, Declaration, Expression,
    Function, FunctionType, ImportDeclarationSpecifier, JSXElement, JSXElementName, JSXFragment,
    MemberExpression, ModuleDeclaration, Statement, VariableDeclarator, YieldExpression,
};
use oxc_ast_visit::{Visit, walk};
use oxc_span::{GetSpan, Span};

use crate::stage_contracts::{HmrInfo, HmrRenderCall, SsrImportReplacement, SsrImportRewrite};
use crate::support::diagnostic::{CompilerDiagnostic, DiagnosticSeverity};
use crate::support::span::SourceIndex;
use oxc_allocator::Allocator;
use oxc_diagnostics::{OxcDiagnostic, Severity};
use oxc_semantic::Scoping;
use oxc_syntax::scope::ScopeFlags;
use oxc_syntax::symbol::SymbolId;
use oxc_syntax::xml_entities::decode_entities;

pub(super) fn collect_variable_render_calls<'a>(
    declarations: &oxc_allocator::Vec<'a, VariableDeclarator<'a>>,
    render_names: &HashSet<String>,
    render_calls: &mut Vec<HmrRenderCall>,
) {
    for declaration in declarations {
        let Some(initializer) = &declaration.init else {
            continue;
        };
        let Some(call) = render_call(initializer, render_names) else {
            continue;
        };
        render_calls.push(HmrRenderCall {
            offset: call.start,
            end: call.end,
            terminate_statement: false,
        });
    }
}

pub(super) fn render_call(
    expression: &Expression<'_>,
    render_names: &HashSet<String>,
) -> Option<Span> {
    match expression {
        Expression::CallExpression(call) => match &call.callee {
            Expression::Identifier(identifier)
                if render_names.contains(identifier.name.as_str()) =>
            {
                Some(call.span)
            }
            _ => None,
        },
        Expression::ParenthesizedExpression(expression) => {
            render_call(&expression.expression, render_names)
        }
        Expression::TSInstantiationExpression(expression) => {
            render_call(&expression.expression, render_names)
        }
        _ => None,
    }
}

pub(super) fn has_manual_hmr_boundary(program: &oxc_ast::ast::Program<'_>) -> bool {
    let mut detector = ManualHmrDetector(false);
    detector.visit_program(program);
    detector.0
}

pub(super) struct ManualHmrDetector(bool);

impl<'ast> Visit<'ast> for ManualHmrDetector {
    fn visit_member_expression(&mut self, expression: &MemberExpression<'ast>) {
        if is_import_meta_hot(expression) {
            self.0 = true;
        }
        walk::walk_member_expression(self, expression);
    }
}

fn is_import_meta_hot(expression: &MemberExpression<'_>) -> bool {
    let MemberExpression::StaticMemberExpression(expression) = expression else {
        return false;
    };
    if expression.property.name.as_str() != "hot" {
        return false;
    }
    match &expression.object {
        Expression::ImportMeta(_) => true,
        Expression::StaticMemberExpression(meta) => {
            meta.property.name.as_str() == "meta"
                && matches!(meta.object, Expression::ImportMeta(_))
        }
        _ => false,
    }
}

pub(super) fn binding_name(pattern: &BindingPattern<'_>) -> Option<String> {
    match pattern {
        BindingPattern::BindingIdentifier(identifier) => Some(identifier.name.to_string()),
        BindingPattern::ObjectPattern(_)
        | BindingPattern::ArrayPattern(_)
        | BindingPattern::AssignmentPattern(_) => None,
    }
}

pub(super) struct DefineElementCollector {
    pub(super) define_names: HashSet<String>,
    pub(super) host_names: HashSet<String>,
    pub(super) setup_functions: HashMap<String, SetupFunctionInfo>,
    pub(super) setup_spans: Vec<Span>,
    pub(super) host_root_spans: HashSet<u32>,
}

#[derive(Clone, Copy)]
pub(super) struct SetupFunctionInfo {
    pub(super) span: Span,
    pub(super) host_root: Option<Span>,
}

pub(super) fn collect_setup_functions(
    program: &oxc_ast::ast::Program<'_>,
    host_names: &HashSet<String>,
) -> HashMap<String, SetupFunctionInfo> {
    let mut collector = SetupFunctionCollector {
        host_names,
        functions: HashMap::new(),
    };
    collector.visit_program(program);
    collector.functions
}

struct SetupFunctionCollector<'a> {
    host_names: &'a HashSet<String>,
    functions: HashMap<String, SetupFunctionInfo>,
}

impl<'ast> Visit<'ast> for SetupFunctionCollector<'_> {
    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'ast>) {
        if let Some(name) = binding_name(&declarator.id)
            && let Some(init) = &declarator.init
            && let Some(info) = setup_function_info(init, self.host_names)
        {
            self.functions.insert(name, info);
        }
        walk::walk_variable_declarator(self, declarator);
    }

    fn visit_function(
        &mut self,
        function: &oxc_ast::ast::Function<'ast>,
        flags: oxc_syntax::scope::ScopeFlags,
    ) {
        if function.r#type == FunctionType::FunctionDeclaration
            && let Some(identifier) = &function.id
        {
            self.functions.insert(
                identifier.name.to_string(),
                SetupFunctionInfo {
                    span: function.span,
                    host_root: function_setup_root(function, self.host_names),
                },
            );
        }
        walk::walk_function(self, function, flags);
    }
}

fn setup_function_info(
    expression: &Expression<'_>,
    host_names: &HashSet<String>,
) -> Option<SetupFunctionInfo> {
    match expression {
        Expression::ArrowFunctionExpression(function) => Some(SetupFunctionInfo {
            span: function.span,
            host_root: arrow_setup_root(function, host_names),
        }),
        Expression::FunctionExpression(function) => Some(SetupFunctionInfo {
            span: function.span,
            host_root: function_setup_root(function, host_names),
        }),
        Expression::ParenthesizedExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSAsExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSSatisfiesExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSNonNullExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSInstantiationExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        _ => None,
    }
}

fn setup_function_reference(expression: &Expression<'_>) -> Option<String> {
    match expression {
        Expression::Identifier(identifier) => Some(identifier.name.to_string()),
        Expression::ParenthesizedExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        Expression::TSAsExpression(expression) => setup_function_reference(&expression.expression),
        Expression::TSSatisfiesExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        Expression::TSNonNullExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        Expression::TSInstantiationExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        _ => None,
    }
}

impl<'ast> Visit<'ast> for DefineElementCollector {
    fn visit_call_expression(&mut self, expression: &oxc_ast::ast::CallExpression<'ast>) {
        if let Expression::Identifier(callee) = &expression.callee
            && self.define_names.contains(callee.name.as_str())
            && let Some(argument) = expression.arguments.get(2)
            && let Some(setup) = argument.as_expression()
        {
            let info = setup_function_info(setup, &self.host_names).or_else(|| {
                setup_function_reference(setup)
                    .and_then(|name| self.setup_functions.get(&name).copied())
            });
            if let Some(info) = info {
                self.setup_spans.push(info.span);
                if let Some(root) = info.host_root {
                    self.host_root_spans.insert(root.start);
                }
            }
        }
        walk::walk_call_expression(self, expression);
    }
}

fn arrow_setup_root(
    function: &oxc_ast::ast::ArrowFunctionExpression<'_>,
    host_names: &HashSet<String>,
) -> Option<Span> {
    function
        .body
        .as_expression()
        .and_then(|expression| jsx_host_span(expression, host_names))
        .or_else(|| {
            let oxc_ast::ast::ArrowFunctionBody::FunctionBody(body) = &function.body else {
                return None;
            };
            body.statements.iter().find_map(|statement| {
                let Statement::ReturnStatement(return_statement) = statement else {
                    return None;
                };
                return_statement
                    .argument
                    .as_ref()
                    .and_then(|expression| jsx_host_span(expression, host_names))
            })
        })
}

fn function_setup_root(
    function: &oxc_ast::ast::Function<'_>,
    host_names: &HashSet<String>,
) -> Option<Span> {
    function.body.as_ref().and_then(|body| {
        body.statements.iter().find_map(|statement| {
            let Statement::ReturnStatement(return_statement) = statement else {
                return None;
            };
            return_statement
                .argument
                .as_ref()
                .and_then(|expression| jsx_host_span(expression, host_names))
        })
    })
}

fn jsx_host_span(expression: &Expression<'_>, host_names: &HashSet<String>) -> Option<Span> {
    match expression {
        Expression::ParenthesizedExpression(expression) => {
            return jsx_host_span(&expression.expression, host_names);
        }
        Expression::TSAsExpression(expression) => {
            return jsx_host_span(&expression.expression, host_names);
        }
        Expression::TSSatisfiesExpression(expression) => {
            return jsx_host_span(&expression.expression, host_names);
        }
        Expression::TSNonNullExpression(expression) => {
            return jsx_host_span(&expression.expression, host_names);
        }
        _ => {}
    }
    let Expression::JSXElement(element) = expression else {
        return None;
    };
    let name = match &element.opening_element.name {
        JSXElementName::Identifier(identifier) => identifier.name.as_str(),
        JSXElementName::IdentifierReference(identifier) => identifier.name.as_str(),
        _ => return None,
    };
    host_names.contains(name).then_some(element.span)
}

/// SSR facade names: every binding the server entry can serve, plus the
/// server-only helpers the SSR target needs directly.
const SSR_FACADE_EXPORTS: &[&str] = &[
    "batch",
    "createContext",
    "createEffect",
    "createMemo",
    "createRoot",
    "createSignal",
    "defineElement",
    "event",
    "For",
    "Host",
    "inject",
    "onCleanup",
    "Portal",
    "prop",
    "provide",
    "Show",
    "Slot",
    "Transition",
    "useContext",
];

/// Collect imports whose bindings are served by the SSR facade.
pub(super) fn collect_ssr_runtime_imports(
    source: &str,
    program: &oxc_ast::ast::Program<'_>,
) -> Vec<SsrImportRewrite> {
    let mut imports = Vec::new();
    for statement in &program.body {
        let Some(ModuleDeclaration::ImportDeclaration(import)) = statement.as_module_declaration()
        else {
            continue;
        };
        let module = import.source.value.as_str();
        if module != "@zeus-js/runtime-dom" && module != "@zeus-js/zeus" {
            continue;
        }
        // `import type`, source-phase imports and import attributes keep their
        // original statement: none of them can be split safely by name.
        if import.import_kind == oxc_ast::ast::ImportOrExportKind::Type
            || import.phase.is_some()
            || import.with_clause.is_some()
        {
            continue;
        }
        let Some(specifiers) = &import.specifiers else {
            continue;
        };
        if specifiers.is_empty() {
            continue;
        }

        let mut facade = Vec::new();
        let mut client = Vec::new();
        let mut rewritable = true;
        for specifier in specifiers {
            // Default and namespace imports have no per-name semantics the
            // facade can split, so the statement stays untouched.
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                rewritable = false;
                break;
            };
            let imported = match &specifier.imported {
                oxc_ast::ast::ModuleExportName::IdentifierName(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::IdentifierReference(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::StringLiteral(name) => name.value.as_str(),
            };
            // A string import name (`import { "a-b" as c }`) is legal but never
            // a facade export, so it stays on the original module.
            let text = source
                .get(
                    usize::try_from(specifier.span.start).unwrap_or(usize::MAX)
                        ..usize::try_from(specifier.span.end).unwrap_or(0),
                )
                .map(str::trim)
                .filter(|text| !text.is_empty());
            let Some(text) = text else {
                rewritable = false;
                break;
            };
            let is_type = specifier.import_kind == oxc_ast::ast::ImportOrExportKind::Type;
            let is_facade = matches!(
                &specifier.imported,
                oxc_ast::ast::ModuleExportName::IdentifierName(_)
                    | oxc_ast::ast::ModuleExportName::IdentifierReference(_)
            ) && SSR_FACADE_EXPORTS.contains(&imported);
            if is_type || is_facade {
                facade.push(text.to_owned());
            } else {
                client.push(text.to_owned());
            }
        }
        if !rewritable {
            continue;
        }

        if client.is_empty() {
            imports.push(SsrImportRewrite {
                span: import.source.span,
                replacement: SsrImportReplacement::ModuleSource,
            });
            continue;
        }
        if facade.is_empty() {
            continue;
        }
        imports.push(SsrImportRewrite {
            span: import.span,
            replacement: SsrImportReplacement::Split {
                facade,
                client,
                module: module.to_owned(),
            },
        });
    }
    imports
}

/// Collect direct `defineElement(...)` initializers. These are the only calls
/// that a component library can safely mark pure for a per-component lazy
/// entry: a top-level imported binding cannot be shadowed by a local scope.
pub(super) fn collect_top_level_define_element_calls(
    program: &oxc_ast::ast::Program<'_>,
) -> Vec<Span> {
    let define_names = collect_imported_names(program, "defineElement");
    if define_names.is_empty() {
        return Vec::new();
    }

    let mut calls = Vec::new();
    for statement in &program.body {
        let declaration = statement
            .as_declaration()
            .and_then(|declaration| match declaration {
                Declaration::VariableDeclaration(declaration) => Some(declaration),
                _ => None,
            })
            .or_else(|| match statement.as_module_declaration() {
                Some(ModuleDeclaration::ExportDeclaration(export)) => match &export.declaration {
                    Declaration::VariableDeclaration(declaration) => Some(declaration),
                    _ => None,
                },
                _ => None,
            });
        if let Some(declaration) = declaration {
            for declarator in &declaration.declarations {
                let Some(initializer) = &declarator.init else {
                    continue;
                };
                if let Some(span) = direct_define_element_call(initializer, &define_names) {
                    calls.push(span);
                }
            }
        }

        // `export default defineElement(...)` is a common component-library
        // entry shape. It is still a top-level call and must use the SSR
        // facade just like a named export initializer.
        if let Some(ModuleDeclaration::ExportDefaultDeclaration(export)) =
            statement.as_module_declaration()
            && let Some(expression) = export.declaration.as_expression()
            && let Some(span) = direct_define_element_call(expression, &define_names)
        {
            calls.push(span);
        }
    }
    calls
}

pub(super) fn direct_define_element_call(
    expression: &Expression<'_>,
    define_names: &HashSet<String>,
) -> Option<Span> {
    match expression {
        Expression::CallExpression(call) if matches!(&call.callee, Expression::Identifier(identifier) if define_names.contains(identifier.name.as_str())) => {
            Some(call.span)
        }
        Expression::ParenthesizedExpression(expression) => {
            direct_define_element_call(&expression.expression, define_names)
        }
        Expression::TSAsExpression(expression) => {
            direct_define_element_call(&expression.expression, define_names)
        }
        Expression::TSSatisfiesExpression(expression) => {
            direct_define_element_call(&expression.expression, define_names)
        }
        Expression::TSNonNullExpression(expression) => {
            direct_define_element_call(&expression.expression, define_names)
        }
        Expression::TSInstantiationExpression(expression) => {
            direct_define_element_call(&expression.expression, define_names)
        }
        _ => None,
    }
}

pub(super) fn collect_reserved_names(scoping: &Scoping) -> Vec<String> {
    let mut names = scoping
        .iter_bindings()
        .flat_map(|(_, bindings)| bindings.keys().map(ToString::to_string))
        .collect::<Vec<_>>();
    names.extend(
        scoping
            .root_unresolved_references()
            .iter()
            .map(|(name, _)| name.to_string()),
    );
    names.sort_unstable();
    names.dedup();
    names
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum AsyncExpressionKind {
    Await,
    Yield,
}

/// Finds `await` and `yield` evaluated by a JSX tree itself. Nested functions
/// are skipped: an async event handler may await freely.
#[derive(Default)]
pub(super) struct AsyncExpressionFinder {
    pub(super) expressions: Vec<(Span, AsyncExpressionKind)>,
}

pub(super) struct AsyncComponent {
    /// The component binding name; `None` for a `defineElement` setup.
    pub(super) name: Option<String>,
    /// From the start of the function to the start of its body.
    pub(super) span: Span,
}

/// Collects async or generator functions that render JSX directly and are
/// components: bound to a `PascalCase` name, or passed as a `defineElement`
/// setup. Other async functions may legitimately create DOM after an await.
pub(super) fn collect_async_components(
    program: &oxc_ast::ast::Program<'_>,
    define_element_setup_spans: &[Span],
) -> Vec<AsyncComponent> {
    let mut collector = AsyncComponentCollector {
        define_element_setup_spans,
        declarator_name: None,
        components: Vec::new(),
    };
    collector.visit_program(program);
    collector.components
}

pub(super) struct AsyncComponentCollector<'a> {
    pub(super) define_element_setup_spans: &'a [Span],
    /// The `PascalCase` binding and the function expression span it initializes.
    pub(super) declarator_name: Option<(String, Span)>,
    pub(super) components: Vec<AsyncComponent>,
}

impl AsyncComponentCollector<'_> {
    fn component_name(&self, function_span: Span, own_name: Option<&str>) -> Option<String> {
        own_name
            .filter(|name| is_component_name(name))
            .map(str::to_owned)
            .or_else(|| {
                self.declarator_name
                    .as_ref()
                    .filter(|(_, span)| *span == function_span)
                    .map(|(name, _)| name.clone())
            })
    }

    fn check(
        &mut self,
        function_span: Span,
        body_start: u32,
        own_name: Option<&str>,
        detect_jsx: impl FnOnce(&mut ShallowJsxDetector),
    ) {
        let name = self.component_name(function_span, own_name);
        let is_setup = self.define_element_setup_spans.contains(&function_span);
        if name.is_none() && !is_setup {
            return;
        }
        let mut detector = ShallowJsxDetector(false);
        detect_jsx(&mut detector);
        if detector.0 {
            self.components.push(AsyncComponent {
                name,
                span: Span::new(function_span.start, body_start),
            });
        }
    }
}

pub(super) fn is_component_name(name: &str) -> bool {
    name.chars()
        .next()
        .is_some_and(|character| character.is_ascii_uppercase())
}

pub(super) fn collect_builtin_names(
    program: &oxc_ast::ast::Program<'_>,
) -> HashMap<String, BuiltinBinding> {
    let mut names = HashMap::new();
    for statement in &program.body {
        let Some(ModuleDeclaration::ImportDeclaration(import)) = statement.as_module_declaration()
        else {
            continue;
        };
        let source = import.source.value.as_str();
        if source != "@zeus-js/zeus" && source != "@zeus-js/runtime-dom" {
            continue;
        }
        let Some(specifiers) = &import.specifiers else {
            continue;
        };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                continue;
            };
            let imported = match &specifier.imported {
                oxc_ast::ast::ModuleExportName::IdentifierName(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::IdentifierReference(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::StringLiteral(name) => name.value.as_str(),
            };
            let kind = match imported {
                "ErrorBoundary" => BuiltinKind::ErrorBoundary,
                "Show" => BuiltinKind::Show,
                "For" => BuiltinKind::For,
                "Transition" => BuiltinKind::Transition,
                "Host" => BuiltinKind::Host,
                "Slot" => BuiltinKind::Slot,
                _ => continue,
            };
            let Some(symbol_id) = specifier.local.symbol_id.get() else {
                continue;
            };
            names.insert(
                specifier.local.name.to_string(),
                BuiltinBinding { kind, symbol_id },
            );
        }
    }
    names
}

pub(super) fn collect_define_element_spans(
    program: &oxc_ast::ast::Program<'_>,
    builtin_names: &HashMap<String, BuiltinBinding>,
) -> (Vec<Span>, HashSet<u32>) {
    let define_names = collect_imported_names(program, "defineElement");
    if define_names.is_empty() {
        return (Vec::new(), HashSet::new());
    }

    let host_names = builtin_names
        .iter()
        .filter_map(|(name, binding)| (binding.kind == BuiltinKind::Host).then_some(name.clone()))
        .collect::<HashSet<_>>();
    let setup_functions = collect_setup_functions(program, &host_names);
    let mut collector = DefineElementCollector {
        define_names,
        host_names,
        setup_functions,
        setup_spans: Vec::new(),
        host_root_spans: HashSet::new(),
    };
    collector.visit_program(program);
    (collector.setup_spans, collector.host_root_spans)
}

pub(super) fn collect_imported_names(
    program: &oxc_ast::ast::Program<'_>,
    imported_name: &str,
) -> HashSet<String> {
    let mut names = HashSet::new();
    for statement in &program.body {
        let Some(ModuleDeclaration::ImportDeclaration(import)) = statement.as_module_declaration()
        else {
            continue;
        };
        if import.source.value.as_str() != "@zeus-js/zeus"
            && import.source.value.as_str() != "@zeus-js/runtime-dom"
        {
            continue;
        }
        let Some(specifiers) = &import.specifiers else {
            continue;
        };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                continue;
            };
            let imported = match &specifier.imported {
                oxc_ast::ast::ModuleExportName::IdentifierName(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::IdentifierReference(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::StringLiteral(name) => name.value.as_str(),
            };
            if imported == imported_name {
                names.insert(specifier.local.name.to_string());
            }
        }
    }
    names
}

pub(super) fn collect_hmr_info(program: &oxc_ast::ast::Program<'_>) -> HmrInfo {
    let render_names = collect_render_names(program);
    if render_names.is_empty() {
        return HmrInfo {
            manual_boundary: has_manual_hmr_boundary(program),
            render_calls: Vec::new(),
        };
    }

    let mut render_calls = Vec::new();
    for statement in &program.body {
        match statement {
            Statement::ExpressionStatement(statement) => {
                if let Some(call) = render_call(&statement.expression, &render_names) {
                    render_calls.push(HmrRenderCall {
                        offset: call.start,
                        end: call.end,
                        terminate_statement: true,
                    });
                }
            }
            _ if matches!(
                statement.as_declaration(),
                Some(Declaration::VariableDeclaration(_))
            ) =>
            {
                let Some(Declaration::VariableDeclaration(declaration)) =
                    statement.as_declaration()
                else {
                    unreachable!()
                };
                collect_variable_render_calls(
                    &declaration.declarations,
                    &render_names,
                    &mut render_calls,
                );
            }
            _ if matches!(
                statement.as_module_declaration(),
                Some(ModuleDeclaration::ExportDeclaration(_))
            ) =>
            {
                let Some(ModuleDeclaration::ExportDeclaration(export)) =
                    statement.as_module_declaration()
                else {
                    unreachable!()
                };
                if let Declaration::VariableDeclaration(declaration) = &export.declaration {
                    collect_variable_render_calls(
                        &declaration.declarations,
                        &render_names,
                        &mut render_calls,
                    );
                }
            }
            _ => {}
        }
    }

    HmrInfo {
        manual_boundary: has_manual_hmr_boundary(program),
        render_calls,
    }
}

pub(super) fn collect_render_names(program: &oxc_ast::ast::Program<'_>) -> HashSet<String> {
    let mut names = HashSet::new();
    for statement in &program.body {
        let Some(ModuleDeclaration::ImportDeclaration(import)) = statement.as_module_declaration()
        else {
            continue;
        };
        let source = import.source.value.as_str();
        if source != "@zeus-js/runtime-dom" && source != "@zeus-js/zeus" {
            continue;
        }
        let Some(specifiers) = &import.specifiers else {
            continue;
        };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                continue;
            };
            let imported = match &specifier.imported {
                oxc_ast::ast::ModuleExportName::IdentifierName(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::IdentifierReference(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::StringLiteral(name) => name.value.as_str(),
            };
            if imported == "render" {
                names.insert(specifier.local.name.to_string());
            }
        }
    }
    names
}

pub(super) fn from_oxc_diagnostic(
    diagnostic: &OxcDiagnostic,
    code: &str,
    filename: &str,
    source_index: &SourceIndex<'_>,
) -> CompilerDiagnostic {
    let span = diagnostic.labels.first().map(|label| {
        source_index.span(Span::new(
            label.offset(),
            label.offset().saturating_add(label.len()),
        ))
    });

    CompilerDiagnostic {
        code: code.into(),
        message: diagnostic.message.to_string(),
        severity: if diagnostic.severity == Severity::Warning {
            DiagnosticSeverity::Warning
        } else {
            DiagnosticSeverity::Error
        },
        filename: filename.into(),
        hint: diagnostic.help.as_ref().map(ToString::to_string),
        span,
    }
}

impl<'ast> Visit<'ast> for AsyncExpressionFinder {
    fn visit_await_expression(&mut self, expression: &AwaitExpression<'ast>) {
        self.expressions
            .push((expression.span, AsyncExpressionKind::Await));
        walk::walk_await_expression(self, expression);
    }

    fn visit_yield_expression(&mut self, expression: &YieldExpression<'ast>) {
        self.expressions
            .push((expression.span, AsyncExpressionKind::Yield));
        walk::walk_yield_expression(self, expression);
    }

    fn visit_function(&mut self, _function: &Function<'ast>, _flags: ScopeFlags) {}

    fn visit_arrow_function_expression(&mut self, _arrow: &ArrowFunctionExpression<'ast>) {}

    fn visit_class(&mut self, _class: &Class<'ast>) {}
}

impl<'ast> Visit<'ast> for AsyncComponentCollector<'_> {
    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'ast>) {
        let previous = self.declarator_name.take();
        if let Some(name) = binding_name(&declarator.id)
            && is_component_name(&name)
            && let Some(init) = &declarator.init
        {
            self.declarator_name = Some((name, unwrap_expression(init).span()));
        }
        walk::walk_variable_declarator(self, declarator);
        self.declarator_name = previous;
    }

    fn visit_function(&mut self, function: &Function<'ast>, flags: ScopeFlags) {
        if (function.r#async || function.generator)
            && let Some(body) = &function.body
        {
            self.check(
                function.span,
                body.span.start,
                function.id.as_ref().map(|id| id.name.as_str()),
                |detector| detector.visit_function_body(body),
            );
        }
        walk::walk_function(self, function, flags);
    }

    fn visit_arrow_function_expression(&mut self, arrow: &ArrowFunctionExpression<'ast>) {
        if arrow.r#async {
            self.check(arrow.span, arrow.body.span().start, None, |detector| {
                detector.visit_arrow_function_body(&arrow.body);
            });
        }
        walk::walk_arrow_function_expression(self, arrow);
    }
}

impl<'ast> Visit<'ast> for ShallowJsxDetector {
    fn visit_jsx_element(&mut self, _element: &JSXElement<'ast>) {
        self.0 = true;
    }

    fn visit_jsx_fragment(&mut self, _fragment: &JSXFragment<'ast>) {
        self.0 = true;
    }

    fn visit_function(&mut self, _function: &Function<'ast>, _flags: ScopeFlags) {}

    fn visit_arrow_function_expression(&mut self, _arrow: &ArrowFunctionExpression<'ast>) {}

    fn visit_class(&mut self, _class: &Class<'ast>) {}
}

impl<'ast> Visit<'ast> for JsxDetector {
    fn visit_jsx_element(&mut self, _element: &JSXElement<'ast>) {
        self.0 = true;
    }

    fn visit_jsx_fragment(&mut self, _fragment: &JSXFragment<'ast>) {
        self.0 = true;
    }
}

pub(super) fn unwrap_expression<'ast, 'expr>(
    expression: &'expr Expression<'ast>,
) -> &'expr Expression<'ast> {
    match expression {
        Expression::ParenthesizedExpression(expression) => {
            unwrap_expression(&expression.expression)
        }
        Expression::TSAsExpression(expression) => unwrap_expression(&expression.expression),
        Expression::TSSatisfiesExpression(expression) => unwrap_expression(&expression.expression),
        Expression::TSNonNullExpression(expression) => unwrap_expression(&expression.expression),
        Expression::TSInstantiationExpression(expression) => {
            unwrap_expression(&expression.expression)
        }
        _ => expression,
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum BuiltinKind {
    ErrorBoundary,
    Show,
    For,
    Transition,
    Host,
    Slot,
}

#[derive(Debug, Clone, Copy)]
pub(super) struct BuiltinBinding {
    pub(super) kind: BuiltinKind,
    pub(super) symbol_id: SymbolId,
}

/// Detects JSX evaluated by a function body itself, not by nested functions.
pub(super) struct ShallowJsxDetector(pub(super) bool);

pub(super) struct JsxDetector(pub(super) bool);
