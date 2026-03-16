//! 编译器错误类型

/// 编译错误类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompileErrorType {
    /// 解析错误
    Parse,
    /// 语法错误
    Syntax,
    /// 类型错误
    Type,
    /// 语义错误
    Semantic,
    /// 代码生成错误
    Codegen,
    /// 选项错误
    Options,
    /// 未知错误
    Unknown,
}

impl CompileErrorType {
    pub fn as_str(&self) -> &'static str {
        match self {
            CompileErrorType::Parse => "E1001",
            CompileErrorType::Syntax => "E2001",
            CompileErrorType::Type => "E3001",
            CompileErrorType::Semantic => "E4001",
            CompileErrorType::Codegen => "E5001",
            CompileErrorType::Options => "E6001",
            CompileErrorType::Unknown => "E9999",
        }
    }
}

/// 编译错误
#[derive(Debug, Clone)]
pub struct CompileError {
    /// 错误类型
    pub error_type: CompileErrorType,
    /// 错误消息
    pub message: String,
    /// 错误代码
    pub code: Option<String>,
    /// 错误起始位置
    pub start_offset: u32,
    /// 错误结束位置
    pub end_offset: u32,
}

impl CompileError {
    /// 创建新的编译错误
    pub fn new(message: impl Into<String>, start_offset: u32, end_offset: u32) -> Self {
        Self {
            error_type: CompileErrorType::Unknown,
            message: message.into(),
            code: None,
            start_offset,
            end_offset,
        }
    }

    /// 创建指定类型的编译错误
    pub fn new_with_type(error_type: CompileErrorType, message: impl Into<String>, start_offset: u32, end_offset: u32) -> Self {
        Self {
            error_type,
            message: message.into(),
            code: Some(error_type.as_str().to_string()),
            start_offset,
            end_offset,
        }
    }

    /// 创建带错误代码的编译错误
    pub fn with_code(mut self, code: impl Into<String>) -> Self {
        self.code = Some(code.into());
        self
    }

    /// 创建解析错误
    pub fn parse(message: impl Into<String>, start_offset: u32, end_offset: u32) -> Self {
        Self::new_with_type(CompileErrorType::Parse, message, start_offset, end_offset)
    }

    /// 创建语法错误
    pub fn syntax(message: impl Into<String>, start_offset: u32, end_offset: u32) -> Self {
        Self::new_with_type(CompileErrorType::Syntax, message, start_offset, end_offset)
    }

    /// 创建类型错误
    pub fn type_error(message: impl Into<String>, start_offset: u32, end_offset: u32) -> Self {
        Self::new_with_type(CompileErrorType::Type, message, start_offset, end_offset)
    }

    /// 创建语义错误
    pub fn semantic(message: impl Into<String>, start_offset: u32, end_offset: u32) -> Self {
        Self::new_with_type(CompileErrorType::Semantic, message, start_offset, end_offset)
    }

    /// 创建代码生成错误
    pub fn codegen(message: impl Into<String>, start_offset: u32, end_offset: u32) -> Self {
        Self::new_with_type(CompileErrorType::Codegen, message, start_offset, end_offset)
    }

    /// 创建选项错误
    pub fn options(message: impl Into<String>) -> Self {
        Self::new_with_type(CompileErrorType::Options, message, 0, 0)
    }

    /// 获取错误位置的行号和列号（需要源代码）
    pub fn get_line_col(&self, source: &str) -> Option<(usize, usize)> {
        let mut line = 1;
        let mut col = 1;

        for (i, c) in source.char_indices() {
            if i as u32 >= self.start_offset {
                break;
            }
            if c == '\n' {
                line += 1;
                col = 1;
            } else {
                col += 1;
            }
        }

        if self.start_offset > 0 && self.start_offset as usize <= source.len() {
            Some((line, col))
        } else {
            None
        }
    }

    /// 生成带上下文的错误信息
    pub fn with_context(&self, source: &str, context_lines: usize) -> String {
        let lines: Vec<&str> = source.lines().collect();
        let (line, col) = self.get_line_col(source).unwrap_or((1, 1));

        let mut result = format!("{} at line {}, column {}:\n", self.code.as_deref().unwrap_or("Error"), line, col);
        result.push_str(&format!("  {}\n", self.message));

        // 添加上下文
        let start = line.saturating_sub(context_lines);
        for i in start..line {
            if i < lines.len() {
                let marker = if i + 1 == line { ">>>" } else { "   " };
                result.push_str(&format!("{} | {}\n", marker, lines[i]));
            }
        }

        // 添加列标记
        if col > 0 {
            result.push_str(&format!("{}{}\n", " ".repeat(col + 4), "^"));
        }

        result
    }
}

impl std::fmt::Display for CompileError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        if let Some(code) = &self.code {
            write!(f, "[{}] {} ({}:{})", code, self.message, self.start_offset, self.end_offset)
        } else {
            write!(f, "{} ({}:{})", self.message, self.start_offset, self.end_offset)
        }
    }
}

impl std::error::Error for CompileError {}

impl From<String> for CompileError {
    fn from(message: String) -> Self {
        Self {
            error_type: CompileErrorType::Unknown,
            message,
            code: None,
            start_offset: 0,
            end_offset: 0,
        }
    }
}

/// 编译结果
pub type CompileResult<T> = Result<T, CompileError>;

/// 警告信息
#[allow(dead_code)]
#[derive(Debug, Clone)]
pub struct Warning {
    /// 警告消息
    pub message: String,
    /// 警告起始位置
    pub start_offset: u32,
    /// 警告结束位置
    pub end_offset: u32,
}

#[allow(dead_code)]
impl Warning {
    /// 创建新的警告
    pub fn new(message: impl Into<String>, start_offset: u32, end_offset: u32) -> Self {
        Self {
            message: message.into(),
            start_offset,
            end_offset,
        }
    }
}

/// 编译输出
#[allow(dead_code)]
#[derive(Debug, Clone, Default)]
pub struct CompileOutput {
    /// 生成的代码
    pub code: String,
    /// 源代码映射（可选）
    pub map: Option<String>,
    /// 使用的运行时 helpers
    pub used_helpers: Vec<String>,
    /// 委托事件列表
    pub delegated_events: Vec<String>,
    /// 警告信息
    pub warnings: Vec<Warning>,
}

#[allow(dead_code)]
impl CompileOutput {
    /// 创建新的编译输出
    pub fn new(code: String) -> Self {
        Self {
            code,
            map: None,
            used_helpers: Vec::new(),
            delegated_events: Vec::new(),
            warnings: Vec::new(),
        }
    }

    /// 添加使用的 helper
    pub fn add_helper(&mut self, helper: impl Into<String>) {
        let helper = helper.into();
        if !self.used_helpers.contains(&helper) {
            self.used_helpers.push(helper);
        }
    }

    /// 添加委托事件
    pub fn add_delegated_event(&mut self, event: impl Into<String>) {
        let event = event.into();
        if !self.delegated_events.contains(&event) {
            self.delegated_events.push(event);
        }
    }

    /// 添加警告
    pub fn add_warning(&mut self, warning: Warning) {
        self.warnings.push(warning);
    }
}
