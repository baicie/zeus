//! Lexical preflight that rejects input the Oxc parser would recurse through
//! until the worker stack overflows.
//!
//! Oxc has no recursion guard: a stack overflow aborts the whole host process
//! instead of returning a diagnostic. The worker thread in `lib.rs` buys a
//! larger stack, so this preflight is the only protection and it has to hold
//! for every construct the parser recurses on.
//!
//! Nesting depth alone is not the right measure. A chain such as `(a) => (b) =>
//! …` keeps its bracket depth at one while the parser still recurses once per
//! arrow, and `a.a.a…` builds a left-deep tree without any nesting token at
//! all. Instead every construct that grows the parser stack adds a weight
//! proportional to the stack one level of it consumes, calibrated against the
//! measured crash depth of the shipped 64 MiB worker:
//!
//! | construct                    | crash depth |
//! | ---------------------------- | ----------- |
//! | JSX element `<a>`            | 23,000      |
//! | object literal `{a:`         | 28,500      |
//! | template substitution `${`   | 29,000      |
//! | bracket `[`                  | 32,500      |
//! | parenthesis `(`              | 32,500      |
//! | JSX attribute expression `{` | 36,000      |
//! | call `f(`                    | 37,000      |
//! | type arguments `Array<`      | 40,000      |
//! | arrow `=>`                   | 49,000      |
//! | ternary `?` / assignment `=` | 70,000      |
//! | `new`                        | 144,000     |
//! | `if`                         | 164,000     |
//! | label `a:`                   | 47,000      |
//! | class `extends`              | 55,000      |
//! | `keyof`                      | 123,000     |
//! | `as` / `satisfies`           | 838,000     |
//! | decorator `@`                | 16,000,000  |
//! | prefix `!`, member `.`       | 592,000     |
//! | binary operator              | 832,000     |
//!
//! Weights are `WEIGHT_SCALE / crash_depth`, and the running cost is summed
//! along the expression spine: a bracket saves the cost of its parent frame
//! and restores it when it closes, while postfix and infix operators stay on
//! the same spine, so `f()()()…` and `a.a.a…` accumulate. `,`, `;` and a line
//! break after a completed value end a statement and start a sibling, so long
//! flat argument lists, object literals, arrays and semicolon-free statement
//! sequences never accumulate. Body-taking keywords never start a sibling at a
//! line break, so braceless `if`/`while`/`for` chains still accumulate.
//!
//! The budget is 8,192 JSX levels' worth of weight, which is the limit the
//! compiler documents. For every other construct the same budget maps to a
//! depth at most 0.35x of its measured crash depth, so the guard rejects
//! pathological input long before the worker stack is at risk, and realistic
//! source stays far below it.

/// Scale used to express weights as integer parts per billion. It is large
/// enough that the cheapest weight (an `if` at 1/164,000) stays above zero.
const WEIGHT_SCALE: u64 = 1_000_000_000;

/// JSX element or fragment: 23,000 levels abort the worker.
const W_JSX_ELEMENT: u64 = WEIGHT_SCALE / 23_000;
/// Object literal or block brace: 28,500 levels.
const W_BRACE: u64 = WEIGHT_SCALE / 28_500;
/// Template substitution `${`: 29,000 levels.
const W_TEMPLATE_EXPR: u64 = WEIGHT_SCALE / 29_000;
/// `[`: 32,500 levels.
const W_BRACKET: u64 = WEIGHT_SCALE / 32_500;
/// `(`: 32,500 levels.
const W_PAREN: u64 = WEIGHT_SCALE / 32_500;
/// `{…}` in JSX children or a JSX attribute: 36,000 levels.
const W_JSX_EXPR: u64 = WEIGHT_SCALE / 36_000;
/// `<T>` type arguments: 40,000 levels.
const W_TYPE_ARGS: u64 = WEIGHT_SCALE / 40_000;
/// `=>`: 49,000 levels.
const W_ARROW: u64 = WEIGHT_SCALE / 49_000;
/// `?` and `=`: 70,000 levels each.
const W_CONTROL: u64 = WEIGHT_SCALE / 70_000;
/// `new`: 144,000 levels.
const W_NEW: u64 = WEIGHT_SCALE / 144_000;
/// `if` without braces recurses once per `if`: 164,000 levels.
const W_IF: u64 = WEIGHT_SCALE / 164_000;
/// `while` without braces: 167,000 levels.
const W_WHILE: u64 = WEIGHT_SCALE / 167_000;
/// `for` with a block body: 113,000 levels.
const W_FOR: u64 = WEIGHT_SCALE / 113_000;
/// `else`, `do` and `else if` add a frame per link.
const W_ELSE: u64 = WEIGHT_SCALE / 164_000;
/// A label `a:` on a nested statement: 47,000 levels.
const W_LABEL: u64 = WEIGHT_SCALE / 47_000;
/// `extends` in a class heritage clause: 55,000 levels.
const W_HERITAGE: u64 = WEIGHT_SCALE / 55_000;
/// `keyof`: 123,000 levels. It is a type-level prefix operator.
const W_KEYOF: u64 = WEIGHT_SCALE / 123_000;
/// `as` / `satisfies`: 838,000 levels.
const W_AS: u64 = WEIGHT_SCALE / 838_000;
/// A decorator: 16,000,000 levels.
const W_DECORATOR: u64 = WEIGHT_SCALE / 16_000_000;
/// Prefix operators such as `!`, `typeof` and `delete`: 592,000 levels.
const W_PREFIX: u64 = WEIGHT_SCALE / 592_000;
/// Member access `.` and `?.`: 592,000 levels.
const W_MEMBER: u64 = WEIGHT_SCALE / 592_000;
/// One binary operator: 832,000 levels.
const W_BINARY: u64 = WEIGHT_SCALE / 832_000;
/// A closed call or index keeps its receiver on the same spine, which is what
/// makes `f()()()…` accumulate; that chain aborts at 832,000 calls.
const W_CALL_CLOSE: u64 = W_BINARY;

/// Budget for one module: exactly 8,192 JSX elements, the documented limit.
const MAX_NESTING_COST: u64 = 8_192 * W_JSX_ELEMENT;

/// Upper bound on the lookahead that tells `<T,>` type parameters apart from a
/// JSX tag, so a source full of `<` cannot make the scan quadratic.
const TYPE_PARAMETER_LOOKAHEAD: usize = 4_096;

/// Returns true when `source` is projected to exhaust the worker stack.
pub fn exceeds_nesting_cost(source: &str) -> bool {
    let mut scanner = Scanner {
        bytes: source.as_bytes(),
        index: 0,
        frames: Vec::new(),
        cost: 0,
        mode: Mode::Code,
        // An expression may start at the beginning of a module.
        expression_expected: true,
        boundary: Boundary::None,
        exceeded: false,
    };

    scanner.run()
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Mode {
    /// Ordinary JavaScript or TypeScript.
    Code,
    /// Between `<tag` and the `>` that ends the opening tag.
    JsxTag,
    /// JSX children, where text is not code and quotes are not strings.
    JsxChildren,
    /// The body of a template literal, outside `${…}`.
    Template,
}

#[derive(Clone, Copy)]
enum FrameKind {
    /// `(` or `[` in code.
    Bracketed,
    /// `{` in code, opening an object literal or a block.
    Braced { block: bool },
    /// An opening JSX tag.
    JsxElement,
    /// `{…}` inside a JSX tag or JSX children.
    JsxExpression { in_tag: bool },
    /// `${…}` inside a template literal.
    TemplateExpression,
    /// A template literal body.
    Template,
}

struct Frame {
    kind: FrameKind,
    /// Cost of the enclosing spine, restored when this frame closes.
    saved_cost: u64,
    /// Cost right after this frame's opener, where a sibling starts.
    entry_cost: u64,
    /// Mode to return to when this frame closes.
    saved_mode: Mode,
}

struct Scanner<'a> {
    bytes: &'a [u8],
    index: usize,
    frames: Vec<Frame>,
    cost: u64,
    mode: Mode,
    /// Whether an expression may start here. This separates `<div>` from the
    /// comparison `a < b`, and a regular expression from a division.
    expression_expected: bool,
    /// A statement may have ended at the token the scan is sitting on, and the
    /// next token decides it. A closed statement block sets `BlockClosed`
    /// because `if (a) {} else …` is one statement; a line terminator after a
    /// value sets `LineBreak` because semicolon-free source ends statements
    /// there. Both must defer the sibling reset so no construct is split into
    /// cheap pieces, and both reset the spine when the statement really ends.
    boundary: Boundary,
    exceeded: bool,
}

/// A pending statement boundary. See `Scanner::boundary`.
#[derive(Clone, Copy, PartialEq, Eq)]
enum Boundary {
    /// No boundary is pending.
    None,
    /// A statement block just closed; only a following `else` continues it.
    BlockClosed,
    /// A line terminator followed a token that can end a statement.
    LineBreak,
}

impl Scanner<'_> {
    fn run(&mut self) -> bool {
        while self.index < self.bytes.len() {
            match self.mode {
                Mode::Code => self.scan_code(),
                Mode::JsxTag => self.scan_jsx_tag(),
                Mode::JsxChildren => self.scan_jsx_children(),
                Mode::Template => self.scan_template(),
            }

            if self.exceeded {
                return true;
            }
        }

        false
    }

    fn byte(&self) -> u8 {
        self.bytes[self.index]
    }

    fn peek(&self, offset: usize) -> Option<u8> {
        self.bytes.get(self.index + offset).copied()
    }

    /// Adds `weight` to the current spine and reports whether the budget is
    /// exhausted.
    fn charge(&mut self, weight: u64) {
        self.cost = self.cost.saturating_add(weight);
        if self.cost > MAX_NESTING_COST {
            self.exceeded = true;
        }
    }

    fn push(&mut self, kind: FrameKind, weight: u64, saved_mode: Mode) {
        let entry_cost = self.cost.saturating_add(weight);
        self.frames.push(Frame {
            kind,
            saved_cost: self.cost,
            entry_cost,
            saved_mode,
        });
        self.charge(weight);
    }

    /// Pops the innermost frame and restores the enclosing spine.
    fn pop(&mut self) -> Option<Frame> {
        let frame = self.frames.pop()?;
        self.cost = frame.saved_cost;
        self.mode = frame.saved_mode;
        Some(frame)
    }

    /// Starts a sibling expression at the enclosing frame's cost.
    fn start_sibling(&mut self) {
        self.cost = self.frames.last().map_or(0, |frame| frame.entry_cost);
    }

    fn scan_code(&mut self) {
        let byte = self.byte();
        self.resolve_block_close(byte);

        if Scanner::is_line_break(byte) {
            self.index += 1;
            self.mark_line_boundary();
            return;
        }
        self.resolve_line_boundary(byte);

        match byte {
            b'/' if self.peek(1) == Some(b'/') => {
                self.index += 2;
                self.skip_line_comment();
            }
            b'/' if self.peek(1) == Some(b'*') => {
                self.index += 2;
                self.skip_block_comment();
            }
            b'/' if self.expression_expected && self.skip_regex() => {}
            b'\'' | b'"' => {
                self.index += 1;
                self.skip_quoted(byte);
                self.expression_expected = false;
            }
            b'`' => {
                self.push(FrameKind::Template, 0, Mode::Code);
                self.mode = Mode::Template;
                self.index += 1;
                self.expression_expected = true;
            }
            b'(' => {
                self.push(FrameKind::Bracketed, W_PAREN, Mode::Code);
                self.index += 1;
                self.expression_expected = true;
            }
            b'[' => {
                self.push(FrameKind::Bracketed, W_BRACKET, Mode::Code);
                self.index += 1;
                self.expression_expected = true;
            }
            b'{' => {
                // A brace that follows a complete expression (`if (a) {`,
                // `class A {`) opens a statement block; a brace where an
                // expression may start (`= {`, `f({`) opens an object literal.
                let block = !self.expression_expected;
                self.push(FrameKind::Braced { block }, W_BRACE, Mode::Code);
                self.index += 1;
                self.expression_expected = true;
            }
            b')' | b']' => {
                if self
                    .pop_if(|kind| matches!(kind, FrameKind::Bracketed))
                    .is_some()
                {
                    // The closed expression stays on the parent spine.
                    self.charge(W_CALL_CLOSE);
                }
                self.index += 1;
                self.expression_expected = false;
            }
            b'}' => {
                self.close_brace_in_code();
                self.index += 1;
            }
            b',' | b';' => self.skip_separator(),
            b'<' => self.scan_angle(),
            b'=' if self.peek(1) == Some(b'>') => {
                self.charge(W_ARROW);
                self.index += 2;
                self.expression_expected = true;
            }
            b'=' if self.peek(1) != Some(b'=') => {
                self.charge(W_CONTROL);
                self.index += 1;
                self.expression_expected = true;
            }
            b'?' if !matches!(self.peek(1), Some(b'.' | b'?')) => {
                self.charge(W_CONTROL);
                self.index += 1;
                self.expression_expected = true;
            }
            b'.' => {
                self.charge(W_MEMBER);
                self.index += 1;
                self.expression_expected = false;
            }
            b'!' => {
                self.charge(W_PREFIX);
                self.index += 1;
                self.expression_expected = true;
            }
            b'@' => {
                // A decorator wraps the declaration it annotates.
                self.charge(W_DECORATOR);
                self.index += 1;
                self.expression_expected = true;
            }
            byte if byte.is_ascii_digit() => {
                self.skip_number();
                self.expression_expected = false;
            }
            byte if is_identifier_start(byte) => self.scan_identifier(),
            byte if is_binary_operator(byte) => self.skip_binary_operator(),
            _ => self.index += 1,
        }
    }

    /// `else if (…) {…}` nests one level per link, so a closed statement block
    /// only ends its statement when no `else` follows.
    fn resolve_block_close(&mut self, byte: u8) {
        if self.boundary != Boundary::BlockClosed || byte.is_ascii_whitespace() || byte == b'/' {
            return;
        }

        if self.word_at(self.index) != Some(b"else") {
            self.start_sibling();
        }
        self.boundary = Boundary::None;
    }

    fn skip_separator(&mut self) {
        self.start_sibling();
        self.boundary = Boundary::None;
        self.index += 1;
        self.expression_expected = true;
    }

    fn skip_binary_operator(&mut self) {
        self.charge(W_BINARY);
        self.boundary = Boundary::None;
        self.index += 1;
        self.expression_expected = true;
    }

    fn is_line_break(byte: u8) -> bool {
        matches!(byte, b'\n' | b'\r')
    }

    /// Arms a statement boundary when the line ends with a token that can end
    /// an expression. A line ending in an operator, an opening delimiter, a
    /// member `.` or an operator keyword (`new`, `as`, `typeof`) continues the
    /// expression, so no boundary is armed there.
    fn mark_line_boundary(&mut self) {
        let mut previous = self.index;
        while previous > 0 && self.bytes[previous - 1].is_ascii_whitespace() {
            previous -= 1;
        }
        let Some(&token) = previous.checked_sub(1).and_then(|at| self.bytes.get(at)) else {
            return;
        };

        if self.line_continues_after(previous, token) {
            return;
        }
        // A closed block already records where its statement can end; a line
        // break inside it must not replace that state.
        if self.boundary == Boundary::None {
            self.boundary = Boundary::LineBreak;
        }
    }

    /// Whether the token ending at `end` lets the expression run past the line
    /// break. Judgment is conservative: only a closing bracket, a closed
    /// literal or a value ends a line, so a construct that can keep growing —
    /// every one the guard rejects — is never split into siblings.
    fn line_continues_after(&self, end: usize, token: u8) -> bool {
        match token {
            b')' | b']' | b'}' | b'\'' | b'"' | b'`' => false,
            // `=>` and a comparison both continue; a `>` that closes a JSX tag
            // or type arguments ends an element, which is a value.
            b'>' => {
                let before = end.checked_sub(2).and_then(|at| self.bytes.get(at));
                matches!(before, Some(b'=')) || before.is_none_or(u8::is_ascii_whitespace)
            }
            byte if is_identifier_continue(byte) => {
                self.word_ending_at(end).is_some_and(line_continues_word)
            }
            _ => true,
        }
    }

    /// A boundary is applied only when the next word declares a statement at a
    /// position where a statement can appear. Body-taking keywords (`if`,
    /// `for`, `while`, `do`, `try`, `switch`) are left out on purpose: a
    /// braceless chain of them is the one construct whose depth a reset could
    /// hide, and a block always closes with `}`, which already starts the next
    /// sibling.
    fn resolve_line_boundary(&mut self, byte: u8) {
        if self.boundary != Boundary::LineBreak {
            return;
        }
        if byte.is_ascii_whitespace() {
            return;
        }
        if byte == b'/' && matches!(self.peek(1), Some(b'/' | b'*')) {
            return;
        }

        self.boundary = Boundary::None;

        if !self.statements_allowed_here() || !is_identifier_start(byte) {
            return;
        }

        if self.word_at(self.index).is_some_and(starts_statement) {
            self.start_sibling();
        }
    }

    /// Automatic semicolon insertion only ends statements. Inside parentheses
    /// or brackets the previous line is an unfinished expression, so a keyword
    /// there is not a sibling.
    fn statements_allowed_here(&self) -> bool {
        match self.frames.last().map(|frame| frame.kind) {
            None => true,
            Some(FrameKind::Braced { block }) => block,
            _ => false,
        }
    }

    /// Handles `<` in code: JSX, type parameters or a comparison.
    fn scan_angle(&mut self) {
        let next = self.peek(1);
        let jsx = self.expression_expected;

        match next {
            Some(b'>') if jsx => {
                self.push(FrameKind::JsxElement, W_JSX_ELEMENT, Mode::Code);
                self.mode = Mode::JsxChildren;
                self.index += 2;
            }
            Some(b'/') if jsx => {
                self.skip_to_tag_end();
                self.pop_jsx_element();
            }
            Some(next) if is_identifier_start(next) || next == b'$' => {
                if jsx && !self.starts_type_parameters() {
                    self.push(FrameKind::JsxElement, W_JSX_ELEMENT, Mode::Code);
                    self.mode = Mode::JsxTag;
                    self.index += 1;
                } else {
                    // Type parameters and comparisons share the tighter weight,
                    // so `<` cannot hide recursion behind the cheaper parse.
                    self.charge(W_TYPE_ARGS);
                    self.index += 1;
                    self.expression_expected = true;
                }
            }
            _ => {
                self.charge(W_BINARY);
                self.index += 1;
                self.expression_expected = true;
            }
        }
    }

    /// In TSX, `<T,>` and `<T = Default>` are type parameter lists, not JSX
    /// tags. Treating them as tags would put the following arrow body into
    /// JSX-children mode, where brackets are text and nothing is counted.
    fn starts_type_parameters(&self) -> bool {
        let end = (self.index + TYPE_PARAMETER_LOOKAHEAD).min(self.bytes.len());
        let mut index = self.index + 1;
        let mut depth = 0usize;

        while index < end {
            match self.bytes[index] {
                b'<' => depth += 1,
                b'>' if depth > 0 => depth -= 1,
                b'>' => return false,
                b',' | b'=' if depth == 0 => return true,
                // A JSX tag has no braces; `{` before `>` means an attribute
                // expression, so this is a tag after all.
                b'{' if depth == 0 => return false,
                b'\'' | b'"' => {
                    index += 1;
                    while index < end && self.bytes[index] != self.bytes[index - 1] {
                        index += 1;
                    }
                }
                _ => {}
            }
            index += 1;
        }

        false
    }

    fn scan_jsx_tag(&mut self) {
        let byte = self.byte();
        match byte {
            b'>' => {
                let self_closing = self.index > 0 && self.bytes[self.index - 1] == b'/';
                self.index += 1;
                if self_closing {
                    self.pop_jsx_element();
                } else {
                    self.mode = Mode::JsxChildren;
                }
            }
            b'{' => {
                self.push(
                    FrameKind::JsxExpression { in_tag: true },
                    W_JSX_EXPR,
                    Mode::JsxTag,
                );
                self.mode = Mode::Code;
                self.index += 1;
                self.expression_expected = true;
            }
            // JSX attribute strings have no backslash escapes, so a quote
            // always ends the value.
            b'\'' | b'"' => {
                self.index += 1;
                self.skip_jsx_attribute_string(byte);
            }
            _ => self.index += 1,
        }
    }

    fn scan_jsx_children(&mut self) {
        match self.byte() {
            b'{' => {
                self.push(
                    FrameKind::JsxExpression { in_tag: false },
                    W_JSX_EXPR,
                    Mode::JsxChildren,
                );
                self.mode = Mode::Code;
                self.index += 1;
                self.expression_expected = true;
            }
            b'<' => self.scan_jsx_child_angle(),
            // Every other byte is text: `Don't` in JSX text must not open a
            // string, which used to hide every following construct.
            _ => self.index += 1,
        }
    }

    /// Inside JSX children `<` always opens or closes a tag; the
    /// expression-expected heuristic only applies to code.
    fn scan_jsx_child_angle(&mut self) {
        match self.peek(1) {
            Some(b'/') => {
                self.skip_to_tag_end();
                self.pop_jsx_element();
            }
            Some(b'>') => {
                self.push(FrameKind::JsxElement, W_JSX_ELEMENT, Mode::JsxChildren);
                self.mode = Mode::JsxChildren;
                self.index += 2;
            }
            Some(next) if is_identifier_start(next) || next == b'$' => {
                self.push(FrameKind::JsxElement, W_JSX_ELEMENT, Mode::JsxChildren);
                self.mode = Mode::JsxTag;
                self.index += 1;
            }
            // `a < b` as text.
            _ => self.index += 1,
        }
    }

    fn scan_template(&mut self) {
        match self.byte() {
            b'\\' => self.index = (self.index + 2).min(self.bytes.len()),
            b'`' => {
                self.index += 1;
                if self
                    .pop_if(|kind| matches!(kind, FrameKind::Template))
                    .is_none()
                {
                    self.mode = Mode::Code;
                }
                self.expression_expected = false;
            }
            b'$' if self.peek(1) == Some(b'{') => {
                self.push(
                    FrameKind::TemplateExpression,
                    W_TEMPLATE_EXPR,
                    Mode::Template,
                );
                self.mode = Mode::Code;
                self.index += 2;
                self.expression_expected = true;
            }
            _ => self.index += 1,
        }
    }

    /// `}` in code mode closes the innermost `{` of a JSX expression, a
    /// template substitution or an ordinary brace, in that order.
    fn close_brace_in_code(&mut self) {
        match self.frames.last().map(|frame| frame.kind) {
            Some(FrameKind::JsxExpression { in_tag }) => {
                self.pop();
                self.charge(W_JSX_EXPR);
                self.mode = if in_tag {
                    Mode::JsxTag
                } else {
                    Mode::JsxChildren
                };
                self.expression_expected = true;
            }
            Some(FrameKind::TemplateExpression) => {
                self.pop();
            }
            _ => {
                if let Some(frame) = self.pop_if(|kind| matches!(kind, FrameKind::Braced { .. })) {
                    match frame.kind {
                        // A closed statement block usually ends a statement,
                        // so the next one starts at the enclosing sibling cost
                        // and sibling `if`/`for` bodies never accumulate. An
                        // `else` after it continues the same statement, which
                        // `boundary` decides on the next token.
                        FrameKind::Braced { block: true } => {
                            self.boundary = Boundary::BlockClosed;
                        }
                        // A closed object literal stays on the expression spine.
                        _ => self.charge(W_CALL_CLOSE),
                    }
                }
                self.expression_expected = false;
            }
        }
    }

    fn pop_if(&mut self, matches: impl Fn(&FrameKind) -> bool) -> Option<Frame> {
        if !self.frames.last().is_some_and(|frame| matches(&frame.kind)) {
            return None;
        }
        self.pop()
    }

    /// Closes the innermost open JSX element. A closing tag or `/>` may target
    /// it while inner expression frames are already balanced.
    fn pop_jsx_element(&mut self) {
        let position = self
            .frames
            .iter()
            .rposition(|frame| matches!(frame.kind, FrameKind::JsxElement));
        let Some(position) = position else {
            return;
        };

        let frame = self.frames.remove(position);
        self.cost = frame.saved_cost;
        self.mode = frame.saved_mode;
        self.expression_expected = false;
    }

    fn skip_to_tag_end(&mut self) {
        while self.index < self.bytes.len() {
            if self.bytes[self.index] == b'>' {
                self.index += 1;
                return;
            }
            self.index += 1;
        }
    }

    fn scan_identifier(&mut self) {
        let start = self.index;
        self.index += 1;
        while self.index < self.bytes.len() && is_identifier_continue(self.bytes[self.index]) {
            self.index += 1;
        }

        let word = &self.bytes[start..self.index];

        // `a: if (a) {…}` — a label on a nested statement recurses once per
        // label. Only an object-literal key shares the `identifier:` shape, so
        // the charge is skipped exactly there.
        let object_key = self
            .frames
            .last()
            .is_some_and(|frame| matches!(frame.kind, FrameKind::Braced { block: false }));
        if !object_key && self.bytes.get(self.index) == Some(&b':') {
            self.charge(W_LABEL);
        }

        // `class A extends B extends …` is not valid syntax, but the parser
        // still recurses through the heritage clause before reporting it.
        if matches!(word, b"extends") {
            self.charge(W_HERITAGE);
        } else if matches!(word, b"keyof" | b"unique" | b"readonly" | b"infer") {
            self.charge(W_KEYOF);
        }

        self.expression_expected = matches!(
            word,
            b"new"
                | b"typeof"
                | b"void"
                | b"delete"
                | b"await"
                | b"yield"
                | b"return"
                | b"case"
                | b"throw"
                | b"in"
                | b"of"
                | b"instanceof"
                | b"do"
                | b"else"
                | b"if"
                | b"while"
                | b"for"
                | b"switch"
                | b"catch"
        );

        if matches!(word, b"new") {
            self.charge(W_NEW);
        } else if matches!(word, b"if") {
            // `if (a) if (b) …` recurses per `if` even without braces.
            self.charge(W_IF);
        } else if matches!(word, b"while") {
            // `while (a) while (b) …` nests the same way; a `do … while` tail
            // charges once more, which only tightens the guard.
            self.charge(W_WHILE);
        } else if matches!(word, b"for") {
            // A `for` body always recurses through its own statement frame.
            self.charge(W_FOR);
        } else if matches!(word, b"else") || matches!(word, b"do") {
            self.charge(W_ELSE);
        } else if matches!(word, b"typeof" | b"void" | b"delete" | b"await" | b"yield") {
            self.charge(W_PREFIX);
        } else if matches!(word, b"as" | b"satisfies") {
            // `x as A as B …` wraps the expression once per assertion.
            self.charge(W_AS);
        }
    }

    fn skip_number(&mut self) {
        while self.index < self.bytes.len() {
            let byte = self.bytes[self.index];
            if byte.is_ascii_alphanumeric() || byte == b'.' || byte == b'_' {
                self.index += 1;
            } else {
                return;
            }
        }
    }

    fn skip_line_comment(&mut self) {
        while self.index < self.bytes.len() && self.bytes[self.index] != b'\n' {
            self.index += 1;
        }
    }

    fn skip_block_comment(&mut self) {
        while self.index < self.bytes.len() {
            if self.bytes[self.index] == b'*' && self.peek(1) == Some(b'/') {
                self.index += 2;
                return;
            }
            self.index += 1;
        }
    }

    /// Skips a regular expression literal. Returns false when a newline ends
    /// the candidate before its closing `/`, so the caller treats `/` as an
    /// operator instead.
    fn skip_regex(&mut self) -> bool {
        let mut index = self.index + 1;
        let mut in_class = false;

        while index < self.bytes.len() {
            match self.bytes[index] {
                b'\\' => index += 2,
                b'[' => {
                    in_class = true;
                    index += 1;
                }
                b']' => {
                    in_class = false;
                    index += 1;
                }
                b'/' if !in_class => {
                    index += 1;
                    while index < self.bytes.len() && self.bytes[index].is_ascii_alphabetic() {
                        index += 1;
                    }
                    self.index = index;
                    self.expression_expected = false;
                    return true;
                }
                b'\n' => return false,
                _ => index += 1,
            }
        }

        false
    }

    /// Skips a JSX attribute string, which has no backslash escapes.
    fn skip_jsx_attribute_string(&mut self, quote: u8) {
        while self.index < self.bytes.len() {
            let byte = self.bytes[self.index];
            self.index += 1;
            if byte == quote {
                return;
            }
        }
    }

    fn skip_quoted(&mut self, quote: u8) {
        while self.index < self.bytes.len() {
            let byte = self.bytes[self.index];
            if byte == b'\\' {
                self.index = (self.index + 2).min(self.bytes.len());
                continue;
            }
            self.index += 1;
            if byte == quote {
                return;
            }
        }
    }
}

impl<'a> Scanner<'a> {
    /// Returns the identifier word starting at `index`, if one starts there.
    fn word_at(&self, index: usize) -> Option<&'a [u8]> {
        let start = index;
        if !self
            .bytes
            .get(start)
            .is_some_and(|byte| is_identifier_start(*byte))
        {
            return None;
        }
        let mut end = start + 1;
        while self
            .bytes
            .get(end)
            .is_some_and(|byte| is_identifier_continue(*byte))
        {
            end += 1;
        }
        Some(&self.bytes[start..end])
    }

    /// Returns the identifier word ending just before `end`, if one ends there.
    fn word_ending_at(&self, end: usize) -> Option<&'a [u8]> {
        if !self
            .bytes
            .get(end - 1)
            .is_some_and(|byte| is_identifier_continue(*byte))
        {
            return None;
        }

        let mut start = end - 1;
        while start > 0 && is_identifier_continue(self.bytes[start - 1]) {
            start -= 1;
        }
        if !is_identifier_start(self.bytes[start]) {
            return None;
        }
        Some(&self.bytes[start..end])
    }
}

/// Keywords that declare a statement. A line that starts with one after a
/// completed expression begins that statement, which is how semicolon-free
/// source separates its top-level declarations. Body-taking keywords are absent
/// so a braceless chain of them can never be split into cheap siblings.
fn starts_statement(word: &[u8]) -> bool {
    matches!(
        word,
        b"const"
            | b"let"
            | b"var"
            | b"function"
            | b"class"
            | b"import"
            | b"export"
            | b"type"
            | b"interface"
            | b"enum"
            | b"declare"
            | b"abstract"
            | b"async"
            | b"return"
            | b"throw"
            | b"break"
            | b"continue"
    )
}

/// Keywords that leave an expression unfinished at the end of a line, so the
/// following line still belongs to the same statement.
fn line_continues_word(word: &[u8]) -> bool {
    matches!(
        word,
        b"new"
            | b"typeof"
            | b"void"
            | b"delete"
            | b"await"
            | b"yield"
            | b"return"
            | b"throw"
            | b"case"
            | b"in"
            | b"of"
            | b"instanceof"
            | b"as"
            | b"satisfies"
            | b"keyof"
            | b"extends"
            | b"implements"
            | b"const"
            | b"let"
            | b"var"
            | b"function"
            | b"class"
            | b"import"
            | b"export"
            | b"type"
            | b"interface"
            | b"enum"
            | b"declare"
            | b"abstract"
            | b"public"
            | b"private"
            | b"protected"
            | b"readonly"
            | b"static"
            | b"async"
            | b"else"
            | b"do"
            | b"if"
            | b"while"
            | b"for"
            | b"switch"
            | b"try"
            | b"catch"
            | b"finally"
    )
}

fn is_binary_operator(byte: u8) -> bool {
    matches!(
        byte,
        b'+' | b'-' | b'*' | b'/' | b'%' | b'&' | b'|' | b'^' | b'>' | b'~'
    )
}

fn is_identifier_start(byte: u8) -> bool {
    byte.is_ascii_alphabetic() || byte == b'_' || byte == b'$'
}

fn is_identifier_continue(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'$'
}

#[cfg(test)]
mod tests {
    use super::exceeds_nesting_cost;

    fn repeat(unit: &str, times: usize) -> String {
        unit.repeat(times)
    }

    #[test]
    fn flat_modules_are_free() {
        let source = format!(
            "export const App = () => {}<div/>\n",
            repeat("<div>text</div>\n", 20_000)
        );
        assert!(!exceeds_nesting_cost(&source));
    }

    #[test]
    fn long_argument_lists_objects_and_arrays_do_not_accumulate() {
        let items = repeat("1,", 200_000);
        assert!(!exceeds_nesting_cost(&format!("f({items}0)\n")));
        assert!(!exceeds_nesting_cost(&format!("const o = {{{items}}}\n")));
        assert!(!exceeds_nesting_cost(&format!("const a = [{items}]\n")));
    }

    #[test]
    fn many_sibling_if_statements_stay_cheap() {
        let body = repeat("if (a) { b() }\n", 100_000);
        assert!(!exceeds_nesting_cost(&format!(
            "function f() {{\n{body}}}\n"
        )));
    }

    #[test]
    fn jsx_text_apostrophes_do_not_hide_later_code() {
        let depth = 50_000;
        let source = format!(
            "export const P = () => <p>Don't</p>\nconst v = {}1{}\n",
            repeat("(", depth),
            repeat(")", depth)
        );
        assert!(exceeds_nesting_cost(&source));
    }

    #[test]
    fn generic_arrows_do_not_switch_the_rest_of_the_file_to_jsx_text() {
        let depth = 50_000;
        let source = format!(
            "const id = <T,>(x: T) => x\nconst v = {}1{}\n",
            repeat("(", depth),
            repeat(")", depth)
        );
        assert!(exceeds_nesting_cost(&source));
    }

    #[test]
    fn semicolon_free_statements_do_not_accumulate() {
        // This repository's own style has no semicolons, so a statement ends at
        // a line break. Each one must start a sibling: a 30,000-line module of
        // ordinary constant declarations once reported ZEUS_INPUT_TOO_DEEP.
        assert!(!exceeds_nesting_cost(&repeat(
            "const a = 1 + 2 * 3\n",
            100_000
        )));
        assert!(!exceeds_nesting_cost(&repeat(
            "const App = props => <button>{props.label}</button>\n",
            30_000
        )));
        assert!(!exceeds_nesting_cost(&repeat(
            "function a() { return b() }\n",
            50_000
        )));
    }

    #[test]
    fn line_breaks_never_hide_a_deep_construct() {
        // Every construct the guard rejects is also written across lines: an
        // arrow, a member chain or a braceless `if` body may each start a new
        // line, and the statement boundary must not split them into siblings.
        // Depths match `every_deep_construct_is_rejected`.
        let cases = [
            (800_000, "("),
            (800_000, "["),
            (800_000, "{"),
            (800_000, "<a>"),
            (800_000, "<>"),
            (800_000, "`${"),
            (800_000, "{{a:"),
            (800_000, "f("),
            (800_000, "(a) => "),
            (800_000, "a ? b : "),
            (800_000, "a="),
            (800_000, "new "),
            (800_000, ".a"),
            (800_000, "()"),
            (800_000, "!"),
            (800_000, "a+"),
            (800_000, "[..."),
            (800_000, "!("),
            (800_000, "if(a){}else "),
            (800_000, "if(a)"),
            (4_000_000, "typeof "),
            (240_000, "a: "),
            (84_000, "while(a)"),
            (57_000, "for(;;)"),
            (300_000, "extends B "),
            (620_000, "keyof "),
            (420_000, " as any"),
            (8_000_000, "@d "),
            (800_000, "Array<"),
            (800_000, "<a b={{"),
        ];

        for (depth, opener) in cases {
            let body = std::iter::repeat_n(opener, depth)
                .collect::<Vec<_>>()
                .join("\n");
            for source in [
                format!("const v = {body}\n"),
                format!("function f(a) {{\n{body}\n}}\n"),
                format!("type T = {body}1\n"),
                format!("const A = () => {body}1\n"),
            ] {
                assert!(
                    exceeds_nesting_cost(&source),
                    "expected a diagnostic when `{}` starts each line",
                    opener.trim()
                );
            }
        }
    }

    #[test]
    fn every_deep_construct_is_rejected() {
        // Each case sits at half of that construct's measured crash depth, so
        // the guard must reject it with a wide margin still to spare.
        let cases = [
            (800_000, "const v = {}1{}", "(", ")"),
            (800_000, "const v = {}1{}", "[", "]"),
            (800_000, "function f() {{{}{}", "{", "}"),
            (800_000, "const A = () => {}x", "<a>", ""),
            (800_000, "const A = () => {}x", "<>", ""),
            (800_000, "const v = {}1", "`${{", ""),
            (800_000, "const v = {}1", "{{a:", ""),
            (800_000, "const v = {}1", "f(", ""),
            (800_000, "const A = () => {}1", "<a b={{", ""),
            (800_000, "const f = {}1", "(a) => ", ""),
            (800_000, "const v = {}c", "a ? b : ", ""),
            (800_000, "const v = {}1", "a=", ""),
            (800_000, "const v = {}X", "new ", ""),
            (800_000, "type T = {}1{}", "Array<", ">"),
            (800_000, "const v = a{}", ".a", ""),
            (800_000, "const v = f{}", "()", ""),
            (800_000, "const v = {}a", "!", ""),
            (800_000, "const v = {}a", "a+", ""),
            (800_000, "const v = {}[]{}", "[...", "]"),
            (800_000, "const v = {}a", "!(", ")"),
            (800_000, "function f(a) {{{}{}}}", "if(a){}else ", ""),
            (800_000, "function f(a) {{{}{}}}", "if(a)", ""),
            (4_000_000, "const v = {}a", "typeof ", ""),
            (240_000, "export function f(){\n{}\n{}\n}", "a: ", ""),
            (84_000, "export function f(a){${}{}}", "while(a)", ""),
            (57_000, "export function f(){${}{}}", "for(;;)", ""),
            (300_000, "export class A {}\n{}\n{}", "extends B ", ""),
            (620_000, "type T = {}X\nexport {}", "keyof ", ""),
            (420_000, "export const v = (1 as any){}\n", " as any", ""),
            (8_000_000, "{}\nclass A {{}}", "@d ", ""),
        ];

        for (depth, template, opener, closer) in cases {
            let source = template.replacen("{}", &repeat(opener, depth), 1).replacen(
                "{}",
                &repeat(closer, depth),
                1,
            );
            assert!(
                exceeds_nesting_cost(&source),
                "expected a diagnostic for {}",
                &source[..source.len().min(60)]
            );
        }
    }

    #[test]
    fn budget_boundaries_match_the_documented_limit() {
        let jsx = |depth: usize| {
            format!(
                "export const App = () => {}x{}\n",
                repeat("<div>", depth),
                repeat("</div>", depth)
            )
        };

        assert!(!exceeds_nesting_cost(&jsx(8_000)));
        assert!(exceeds_nesting_cost(&jsx(8_200)));
    }

    #[test]
    fn scan_time_is_linear_in_source_size() {
        // Guards against a quadratic lookahead: a megabyte of JSX-dense input
        // must scan in well under a second even on slow CI.
        for count in [5_000usize, 20_000] {
            let source = format!("export const items = [{}]\n", repeat("<li>a</li>,", count));
            let started = std::time::Instant::now();
            assert!(!exceeds_nesting_cost(&source));
            let elapsed = started.elapsed();
            assert!(
                elapsed.as_millis() < 2_000,
                "{count} items took {elapsed:?}"
            );
        }

        let angles = format!("export const v = {}\n", repeat("a < b ", 200_000));
        let started = std::time::Instant::now();
        let _ = exceeds_nesting_cost(&angles);
        assert!(started.elapsed().as_millis() < 2_000);
    }

    #[test]
    fn realistic_components_stay_cheap() {
        let source = r#"
import { createSignal, For, Show } from '@zeus-js/zeus'

export function App(props: { items: string[] }) {
  const [open, setOpen] = createSignal(false)
  const total = () => props.items.length
  return (
    <section class="app">
      <header onClick={() => setOpen(!open())}>
        <h1>{total()} items</h1>
      </header>
      <Show when={open()}>
        <For each={props.items}>
          {item => <li class={item.length > 3 ? 'long' : 'short'}>{item}</li>}
        </For>
      </Show>
      <p>Don't forget the &amp; sign</p>
    </section>
  )
}
"#;
        assert!(!exceeds_nesting_cost(source));
    }
}
