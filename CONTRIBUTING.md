# Contributing to vscode-grass

Thanks for your interest! Contributions are welcome — bug fixes, new languages, new wildlife, or feature ideas.

---

## Getting started

**Prerequisites:** Node.js 18+, VS Code

```bash
git clone https://github.com/IlanZ93/vscode-grass.git
cd vscode-grass
npm install
npm run watch   # webpack in watch mode
```

Press `F5` in VS Code to launch the extension in a debug window.

---

## Project structure

```
src/
  extension.ts        # Entry point, command & message handlers
  grassState.ts       # Persistent state (growth, watering, seasons)
  grassViewProvider.ts# Webview registration and HTML shell
  messages.ts         # All user-facing strings, 7 languages
media/
  main.js             # Webview logic (pixel art, animations, UI)
  main.css            # Webview styles
  icons/              # Toolbar SVG icons
```

## Build

```bash
npm run compile   # development build
npm run package   # production build (minified)
npx vsce package  # produces .vsix
```

---

## Adding a language

1. Add your language code to the `Lang` union type in `src/messages.ts`
2. Add translations to every `Record<Lang, ...>` in that file (`MESSAGES`, `STAGE_MESSAGES`, `FIRST_TOUCH`, `DEAD_TOUCH`, `UI`)
3. Add the new enum value to `vscodeGrass.messageLanguage` in `package.json`

## Adding wildlife

Animals are created in `media/main.js`. Look for `createButterfly`, `createSnail`, etc. Each visitor is a pixel-art SVG that walks across the lawn. Add a `scheduleXVisit()` function and wire it into the `isFirstState` block.

---

## Pull requests

- Keep PRs focused — one feature or fix per PR
- Test with `F5` in VS Code before submitting
- No new dependencies unless strongly justified
- Translations should be idiomatic, not just machine-translated

---

## Reporting bugs

Open an issue on [GitHub](https://github.com/IlanZ93/vscode-grass/issues) with:
- VS Code version
- Extension version
- Steps to reproduce
