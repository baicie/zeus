//! JSX 编译器配置模块
//!
//! 定义 JSX 编译器的配置选项

/// 生成模式
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum GenerateMode {
    /// DOM 客户端渲染
    #[default]
    Dom,
    /// SSR 服务端渲染
    Ssr,
    /// Universal 跨平台
    Universal,
}

/// JSX 编译器配置
#[derive(Debug, Clone)]
pub struct JsxConfig {
    /// 运行时模块名，默认为 "zeus/runtime-dom"
    pub module_name: String,
    /// 生成目标
    pub generate: GenerateMode,
    /// 是否支持水合
    pub hydratable: bool,
    /// 是否启用事件委托
    pub delegate_events: bool,
    /// 额外的委托事件列表
    pub delegated_events: Vec<String>,
    /// 内置组件列表
    pub built_ins: Vec<String>,
    /// 是否要求 @jsxImportSource 注释
    pub require_import_source: Option<String>,
    /// 是否包装条件表达式为 memo
    pub wrap_conditionals: bool,
    /// 省略最后一个闭合标签
    pub omit_last_closing_tag: bool,
    /// 省略属性引号
    pub omit_quotes: bool,
    /// 静态标记注释
    pub static_marker: String,
    /// 副作用包装函数名
    pub effect_wrapper: String,
    /// 记忆化包装函数名
    pub memo_wrapper: String,
    /// 是否验证模板有效性
    pub validate: bool,
    /// 是否内联静态样式
    pub inline_styles: bool,
}

impl Default for JsxConfig {
    fn default() -> Self {
        Self {
            module_name: "zeus/runtime-dom".to_string(),
            generate: GenerateMode::Dom,
            hydratable: false,
            delegate_events: true,
            delegated_events: Vec::new(),
            built_ins: vec![
                "For".to_string(),
                "Show".to_string(),
                "Switch".to_string(),
                "Match".to_string(),
                "Index".to_string(),
                "Portal".to_string(),
            ],
            require_import_source: None,
            wrap_conditionals: true,
            omit_last_closing_tag: true,
            omit_quotes: true,
            static_marker: "@once".to_string(),
            effect_wrapper: "effect".to_string(),
            memo_wrapper: "memo".to_string(),
            validate: true,
            inline_styles: true,
        }
    }
}
