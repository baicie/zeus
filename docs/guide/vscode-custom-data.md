# VS Code HTML Custom Data

The Web Components build emits `vscode.html-custom-data.json` beside
`custom-elements.json`. It maps documented custom-element tags and attributes
from the generated Custom Elements Manifest, including literal attribute
choices.

Add the generated file to `.vscode/settings.json` in the consuming project:

```json
{
  "html.customData": ["./dist/vscode.html-custom-data.json"]
}
```

VS Code reads each tag and attribute description as hover documentation. Keep
the generated file in the build output and point `html.customData` at its path;
do not maintain a second hand-written list of the same elements.
