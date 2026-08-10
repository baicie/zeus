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

#[derive(Debug)]
pub(crate) struct SourceIndex<'source> {
    source: &'source str,
    line_starts: Vec<usize>,
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

        Self {
            source,
            line_starts,
        }
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
        let column = self.source[line_start..byte_offset].encode_utf16().count();

        SourcePosition {
            offset: u32::try_from(byte_offset).unwrap_or(u32::MAX),
            line: u32::try_from(line_index + 1).unwrap_or(u32::MAX),
            column: u32::try_from(column).unwrap_or(u32::MAX),
        }
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
}
