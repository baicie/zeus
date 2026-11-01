---
'@zeus-js/compiler-native': patch
'@zeus-js/compiler': patch
---

Replace the N-API nesting preflight with a weighted cost model. The previous
scan counted bracket and JSX depth, so several inputs reached the Oxc parser
unguarded and aborted the host process on stack overflow: arrow chains, member
and call chains, `new`, ternary, assignment, `if`/`while`/`for` bodies without
braces, labels, `keyof`, `as`, decorators, and any file whose JSX text contains
an apostrophe, because that opened a string literal and hid the rest of the
file. The new scan weighs every construct that grows the parser stack by its
measured stack cost against the shipped 64 MiB worker, tracks JSX children and
template substitutions as separate modes, and keeps sibling expressions from
accumulating. The 8,192-level JSX limit is unchanged; a leading `<T,>` type
parameter list is no longer mistaken for a JSX tag, and long flat modules are
still accepted.
