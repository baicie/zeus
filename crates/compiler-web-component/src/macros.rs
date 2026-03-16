//! 宏处理器模块

use std::collections::HashMap;

/// 宏类型
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum MacroKind {
    /// 属性宏
    Props,
    /// 事件宏
    Emits,
    /// 暴露宏
    Expose,
}

/// 宏定义
#[derive(Debug, Clone)]
pub struct MacroDefinition {
    /// 宏类型
    pub kind: MacroKind,
    /// 宏名称
    pub name: String,
    /// 宏参数
    pub args: Vec<MacroArg>,
}

/// 宏参数
#[derive(Debug, Clone)]
pub struct MacroArg {
    /// 参数名
    pub name: String,
    /// 参数值
    pub value: String,
}

/// 宏处理器
pub struct MacroProcessor {
    /// 注册的宏
    macros: HashMap<String, MacroDefinition>,
}

impl MacroProcessor {
    /// 创建新的宏处理器
    pub fn new() -> Self {
        Self {
            macros: HashMap::new(),
        }
    }

    /// 注册默认宏
    pub fn register_defaults(&mut self) {
        // Register built-in macros
        self.register(MacroDefinition {
            kind: MacroKind::Props,
            name: "props".to_string(),
            args: vec![],
        });

        self.register(MacroDefinition {
            kind: MacroKind::Emits,
            name: "emits".to_string(),
            args: vec![],
        });

        self.register(MacroDefinition {
            kind: MacroKind::Expose,
            name: "expose".to_string(),
            args: vec![],
        });
    }

    /// 注册宏
    pub fn register(&mut self, macro_def: MacroDefinition) {
        self.macros.insert(macro_def.name.clone(), macro_def);
    }

    /// 处理宏调用
    pub fn process_macro_call(&self, name: &str, args: &[String]) -> Option<MacroResult> {
        let macro_def = self.macros.get(name)?;

        Some(MacroResult {
            kind: macro_def.kind.clone(),
            name: name.to_string(),
            args: args.to_vec(),
        })
    }

    /// 提取宏定义
    pub fn extract_macros(&self, source: &str) -> Vec<ExtractedMacro> {
        let mut extracted = Vec::new();

        // Simple macro detection - looks for $props, $emits, $expose
        for (kind, prefix) in [
            (MacroKind::Props, "$props"),
            (MacroKind::Emits, "$emits"),
            (MacroKind::Expose, "$expose"),
        ] {
            if source.contains(prefix) {
                extracted.push(ExtractedMacro {
                    kind,
                    source: prefix.to_string(),
                    span: (0, 0), // Would need proper span tracking
                });
            }
        }

        extracted
    }
}

impl Default for MacroProcessor {
    fn default() -> Self {
        let mut processor = Self::new();
        processor.register_defaults();
        processor
    }
}

/// 宏处理结果
#[derive(Debug, Clone)]
pub struct MacroResult {
    /// 宏类型
    pub kind: MacroKind,
    /// 宏名称
    pub name: String,
    /// 宏参数
    pub args: Vec<String>,
}

/// 提取的宏
#[derive(Debug, Clone)]
pub struct ExtractedMacro {
    /// 宏类型
    pub kind: MacroKind,
    /// 源代码
    pub source: String,
    /// 位置
    pub span: (usize, usize),
}
