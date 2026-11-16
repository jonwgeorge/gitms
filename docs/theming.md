# Theming

The admin's look comes from CSS custom properties on its root element. Override
any of them with a rule more specific than the default, from a global
stylesheet your root layout imports:

```css
:root .gitms-root {
  --gitms-accent: #7c3aed;
  --gitms-font-sans: "Inter", system-ui, sans-serif;
}
```

| Property | |
| --- | --- |
| `--gitms-bg`, `--gitms-surface` | Page and panel backgrounds |
| `--gitms-line`, `--gitms-grid` | Borders and table rules |
| `--gitms-ink`, `--gitms-ink-muted` | Text |
| `--gitms-accent`, `--gitms-on-accent` | Links, primary buttons and the text on them |
| `--gitms-warn`, `--gitms-warn-soft` | Drafts, the preview banner |
| `--gitms-fault` | Errors and delete buttons |
| `--gitms-space-1` … `--gitms-space-5`, `--gitms-gutter` | Spacing |
| `--gitms-radius-0`, `--gitms-radius-sm`, `--gitms-radius-dot` | Corners |
| `--gitms-font-sans`, `--gitms-font-mono` | Type |

Dark mode follows the system (`prefers-color-scheme`); override the properties
inside a `@media (prefers-color-scheme: dark)` block to tune it.
