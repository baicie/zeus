
#[cfg(test)]
mod tests {
    use super::*;
    use oxc::allocator::Allocator;
    use oxc::parser::Parser;
    use oxc::span::SourceType;

    #[test]
    fn test_print_ast() {
        let source = "const App = () => <div>Hello World</div>";
        let allocator = Allocator::default();
        let source_type = SourceType::jsx();
        let ret = Parser::new(&allocator, source, source_type).parse();
        println!("{:#?}", ret.program);
    }
}
