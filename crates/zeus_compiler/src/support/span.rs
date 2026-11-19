use oxc_span::Span;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourcePosition {
    pub offset: u32,
    pub line: u32,
    pub column: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceSpan {
    pub start: SourcePosition,
    pub end: SourcePosition,
}

/// Spacing of the UTF-16 checkpoints used to keep column lookup bounded.
///
/// Computing a column by counting UTF-16 units from the start of its line is
/// O(line length). Generated or minified components can be one very long line,
/// which makes every span conversion O(source length) and the whole lowering
/// pass O(n²). Checkpoints every 256 bytes bound both the memory cost and the
/// scan needed for one conversion.
const UTF16_CHECKPOINT_BYTES: usize = 256;

#[derive(Debug)]
pub(crate) struct SourceIndex<'source> {
    source: &'source str,
    line_starts: Vec<usize>,
    /// `(byte offset, UTF-16 offset)` at regular char boundaries.
    utf16_checkpoints: Vec<(usize, usize)>,
}

impl<'source> SourceIndex<'source> {
    pub(crate) fn new(source: &'source str) -> Self {
        let mut line_starts = vec![0];
        line_starts.extend(
            source
                .bytes()
                .enumerate()
                .filter_map(|(index, byte)| (byte == b'\n').then_some(index + 1)),
        );

        let mut utf16_checkpoints = Vec::with_capacity(source.len() / UTF16_CHECKPOINT_BYTES + 1);
        utf16_checkpoints.push((0, 0));
        let mut utf16_offset = 0;
        let mut next_checkpoint = UTF16_CHECKPOINT_BYTES;
        for (byte_offset, character) in source.char_indices() {
            if byte_offset >= next_checkpoint {
                utf16_checkpoints.push((byte_offset, utf16_offset));
                next_checkpoint = byte_offset.saturating_add(UTF16_CHECKPOINT_BYTES);
            }
            utf16_offset += character.len_utf16();
        }

        Self {
            source,
            line_starts,
            utf16_checkpoints,
        }
    }

    pub(crate) fn source(&self) -> &'source str {
        self.source
    }

    pub(crate) fn span(&self, span: Span) -> SourceSpan {
        SourceSpan {
            start: self.position(span.start),
            end: self.position(span.end),
        }
    }

    pub(crate) fn position(&self, offset: u32) -> SourcePosition {
        let byte_offset = usize::try_from(offset)
            .unwrap_or(usize::MAX)
            .min(self.source.len());
        let line_index = self
            .line_starts
            .partition_point(|start| *start <= byte_offset)
            - 1;
        let line_start = self.line_starts[line_index];
        let column = self.utf16_offset(byte_offset) - self.utf16_offset(line_start);

        SourcePosition {
            offset: u32::try_from(byte_offset).unwrap_or(u32::MAX),
            line: u32::try_from(line_index + 1).unwrap_or(u32::MAX),
            column: u32::try_from(column).unwrap_or(u32::MAX),
        }
    }

    fn utf16_offset(&self, byte_offset: usize) -> usize {
        let checkpoint = self
            .utf16_checkpoints
            .partition_point(|(byte, _)| *byte <= byte_offset)
            .saturating_sub(1);
        let (mut byte, mut utf16) = self.utf16_checkpoints[checkpoint];
        while byte < byte_offset {
            let Some(character) = self.source[byte..].chars().next() else {
                break;
            };
            byte += character.len_utf8();
            utf16 += character.len_utf16();
        }
        utf16
    }
}

#[cfg(test)]
mod tests {
    use super::SourceIndex;
    use oxc_span::Span;

    #[test]
    fn converts_utf8_offsets_to_utf16_columns_across_crlf() {
        let source = "// 😀中\r\nconst view = <div>{name}</div>";
        let expression_start = source.find("name").expect("fixture contains expression");
        let expression_end = expression_start + "name".len();
        let index = SourceIndex::new(source);
        let span = index.span(Span::new(
            u32::try_from(expression_start).expect("fixture offset fits u32"),
            u32::try_from(expression_end).expect("fixture offset fits u32"),
        ));

        assert_eq!(span.start.offset, 31);
        assert_eq!(span.start.line, 2);
        assert_eq!(span.start.column, 19);
        assert_eq!(span.end.column, 23);
    }

    #[test]
    fn counts_utf16_columns_across_checkpoints_on_a_long_line() {
        let prefix = "a".repeat(100_000);
        let source = format!("{prefix}😀b\nsecond");
        let index = SourceIndex::new(&source);
        let emoji = prefix.len();
        let b = emoji + "😀".len();
        let second = b + 2;

        let emoji_span = index.span(Span::new(
            u32::try_from(emoji).unwrap(),
            u32::try_from(b).unwrap(),
        ));
        assert_eq!(emoji_span.start.line, 1);
        assert_eq!(emoji_span.start.column, 100_000);
        assert_eq!(emoji_span.end.column, 100_002);

        let second_span = index.span(Span::new(
            u32::try_from(second).unwrap(),
            u32::try_from(second + 6).unwrap(),
        ));
        assert_eq!(second_span.start.line, 2);
        assert_eq!(second_span.start.column, 0);
        assert_eq!(second_span.end.column, 6);
    }

    #[test]
    fn checkpointed_columns_match_direct_count_at_every_boundary() {
        let line = format!("{}😀中{}", "a".repeat(300), "b".repeat(400));
        let source = format!("{line}\r\n{line}\r\n{line}");
        let index = SourceIndex::new(&source);
        let mut line_start = 0;

        for (offset, character) in source.char_indices() {
            if character == '\n' {
                line_start = offset + 1;
                continue;
            }
            let column = index.position(u32::try_from(offset).unwrap()).column;
            let expected = source[line_start..offset].encode_utf16().count();
            assert_eq!(column as usize, expected, "offset {offset}");
        }
    }

    #[test]
    fn counts_columns_after_a_checkpoint_on_a_second_line() {
        let first = "x".repeat(1_000);
        let mut second = "y".repeat(700);
        second.push_str(&"z".repeat(300));
        second.push('😀');
        second.push('b');
        let source = format!("{first}\n{second}");
        let index = SourceIndex::new(&source);
        let b = first.len() + 1 + second.len() - 'b'.len_utf8();

        let span = index.span(Span::new(
            u32::try_from(b).unwrap(),
            u32::try_from(b + 1).unwrap(),
        ));
        assert_eq!(span.start.line, 2);
        assert_eq!(span.start.column, 1_002);
    }
}
