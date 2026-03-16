//! WebComponent 编译器选项

/// WebComponent 编译器选项
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct WebComponentOptions {
    /// 是否启用 Shadow DOM
    pub shadow_dom: bool,
    /// 是否自动检测
    pub auto_detect: bool,
    /// 宏模块路径
    pub macro_module: Option<String>,
    /// 是否保留宏
    pub preserve_macros: bool,
    /// 启用的宏列表
    pub macros: Vec<String>,
    /// 模式
    pub mode: WebComponentMode,
    /// 是否提取定义
    pub extract_definitions: bool,
}

impl Default for WebComponentOptions {
    fn default() -> Self {
        Self {
            shadow_dom: true,
            auto_detect: true,
            macro_module: None,
            preserve_macros: false,
            macros: Vec::new(),
            mode: WebComponentMode::Standard,
            extract_definitions: false,
        }
    }
}

/// WebComponent 模式
#[allow(dead_code)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WebComponentMode {
    /// 标准模式
    Standard,
    /// 虚影模式
    Shadow,
    /// 自定义元素
    CustomElement,
}

/// WebComponent 定义
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct WebComponentDefinition {
    /// 标签名
    pub tag_name: String,
    /// 类名
    pub class_name: String,
    /// 属性
    pub props: Vec<PropDefinition>,
    /// 事件
    pub events: Vec<EventDefinition>,
    /// 插槽
    pub slots: Vec<SlotDefinition>,
}

/// 属性定义
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct PropDefinition {
    /// 属性名
    pub name: String,
    /// 类型
    pub type_name: String,
    /// 是否可选
    pub optional: bool,
    /// 默认值
    pub default_value: Option<String>,
}

/// 事件定义
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct EventDefinition {
    /// 事件名
    pub name: String,
    /// 类型
    pub type_name: Option<String>,
}

/// 插槽定义
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct SlotDefinition {
    /// 插槽名
    pub name: Option<String>,
    /// 是否为默认插槽
    pub is_default: bool,
}
