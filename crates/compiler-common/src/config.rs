//! 编译器配置选项

use oxc_allocator::Allocator;
use oxc_span::SourceType;

/// 编译目标平台
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Target {
    /// 浏览器 DOM
    #[default]
    Dom,
    /// 服务端渲染
    Ssr,
    /// Web Component
    WebComponent,
}

/// 编译器选项
#[derive(Debug, Clone)]
pub struct CompilerOptions {
    /// 目标平台
    pub target: Target,
    /// 是否启用 JSX
    pub jsx: bool,
    /// JSX pragma（默认 "h"）
    pub jsx_pragma: Option<String>,
    /// JSX Fragment pragma（默认 "Fragment"）
    pub jsx_pragma_frag: Option<String>,
    /// 运行时模块路径（默认 "@zeus-js/core"）
    pub runtime_module: Option<String>,
    /// 是否启用 Hydration 支持
    pub hydratable: bool,
    /// 是否启用事件委托（默认 true）
    pub delegate_events: bool,
    /// 是否启用 DOM 优化
    pub dom_optimizations: bool,
}

impl Default for CompilerOptions {
    fn default() -> Self {
        Self {
            target: Target::Dom,
            jsx: true,
            jsx_pragma: Some("h".to_string()),
            jsx_pragma_frag: Some("Fragment".to_string()),
            runtime_module: Some("@zeus-js/core".to_string()),
            hydratable: false,
            delegate_events: true,
            dom_optimizations: true,
        }
    }
}

/// 创建编译器实例的上下文
#[allow(dead_code)]
pub struct CompilerContext<'a> {
    /// 内存分配器（拥有所有权）
    allocator: Allocator,
    /// 源代码
    pub source: &'a str,
    /// 源代码类型
    pub source_type: SourceType,
    /// 编译器选项
    pub options: CompilerOptions,
}

#[allow(dead_code)]
impl<'a> CompilerContext<'a> {
    /// 创建新的编译器上下文
    pub fn new(source: &'a str, options: CompilerOptions) -> Self {
        let source_type = if options.jsx {
            SourceType::jsx()
        } else {
            SourceType::default()
        };

        Self {
            allocator: Allocator::default(),
            source,
            source_type,
            options,
        }
    }

    /// 创建使用默认选项的编译器上下文
    pub fn new_with_defaults(source: &'a str) -> Self {
        Self::new(source, CompilerOptions::default())
    }

    /// 获取分配器引用
    pub fn allocator(&self) -> &Allocator {
        &self.allocator
    }
}
