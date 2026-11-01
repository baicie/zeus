---
'@zeus-js/compiler-native': patch
'@zeus-js/compiler': patch
---

Treat a line break as the statement boundary it is. Semicolon-free source —
this repository's own style and most modern projects — ends every statement
with a newline, but the preflight only reset its cost at `,` and `;`, so each
statement of a flat module accumulated on one spine: a 30,000-line module of
ordinary `const` declarations was rejected with `ZEUS_INPUT_TOO_DEEP` while the
same source with semicolons compiled. A line break after a completed value now
arms a boundary that the next token resolves, and only declaration keywords
(`const`, `let`, `function`, `class`, `import`, `return`, …) end the statement.
Body-taking keywords are deliberately absent, so a braceless chain of `if`,
`while` or `for` still accumulates, and every construct the guard rejects is
rejected when written one level per line as well.

The native contract tests now hand the child process its input through a file
instead of stdin. Writing the tens of megabytes these cases build through a
`spawnSync` pipe intermittently deadlocked parent and child, which surfaced as a
spurious 120-second `SIGTERM` heaping the blame on whichever construct happened
to be under test.
