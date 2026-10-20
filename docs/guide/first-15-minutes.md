# Your First 15 Minutes

This route takes a new user from an empty directory to a checked, built Storm
component with Web Component, React, and Vue outputs. It is intentionally
smaller than a production application.

1. Run `pnpm create zeus`, enter a project name, and select **Component
   Library TypeScript**.
2. Open `src/components/greeting.tsx`. Change the greeting text and keep the
   declared `name` prop.
3. Run `pnpm check`, `pnpm build`, and `pnpm test`.
4. Inspect `dist/wc/auto.js`, `dist/react/index.js`, `dist/vue/index.js`,
   `dist/custom-elements.json`, and `dist/zeus.components.json`.
5. Import `dist/wc/auto.js` in a browser page and render
   `<z-greeting name="World">Hello from a slot</z-greeting>`.

The success condition is a passing build and a custom element whose greeting
text, projected slot content, and generated framework entries are present. No
Zeus internal source change is required.

`pnpm check:quick-start` performs the same route against a fresh temporary
project, enforces the 15-minute target, and writes its measured result to
`temp/first-15-minutes/report.json`. The automated timing verifies the path is
short and runnable; it does not replace a human usability session. Record a
human observation separately before making claims about first-time
comprehension or documentation quality.
