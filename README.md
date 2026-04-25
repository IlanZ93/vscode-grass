# vscode-grass 🌿

A virtual lawn living in your VS Code sidebar. Take a break without leaving your IDE.

![Touch grass](https://raw.githubusercontent.com/IlanZ93/vscode-grass/main/media/readme/notifications.gif)

> Inspired by [vscode-pets](https://github.com/tonybaloney/vscode-pets). Built with [Claude](https://claude.ai).
---

## What is it?

vscode-grass gives you a pixel-art lawn in the Explorer panel. It grows over time, dries out if you neglect it, and reacts to the seasons. Click on it when you need a breather.

## Features

- **Living lawn** — grass grows through multiple stages and dies if neglected
- **Water & mow** — keep your lawn alive and trimmed with toolbar buttons
- **Seasons** — spring, summer, autumn, winter each affect growth and color
- **Wildlife** — various creatures visit your lawn as it grows
- **Touch counter** — tracks how many times you've touched grass, with flavor messages
- **Analytics panel** — see your lawn stats and growth progress
- **Passive notifications** — get reminded when your grass needs attention
- **7 languages** — EN, FR, ES, DE, PL, IT, Pirate

## Usage

The lawn lives in the **Explorer** sidebar under **VS CODE GRASS**.

![Mowing the lawn](https://raw.githubusercontent.com/IlanZ93/vscode-grass/main/media/readme/mow%20the%20lawn.gif)

| Action | How |
|--------|-----|
| Touch grass | Click the lawn |
| Water | Toolbar 💧 button |
| Mow | Toolbar 🚜 button |
| Analytics & infos | Toolbar 📊 button |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `vscodeGrass.growthSpeed` | `normal` | `slow`, `normal`, or `fast` |
| `vscodeGrass.enableNotifications` | `true` | Passive lawn reminders |
| `vscodeGrass.messageLanguage` | `en` | Touch message language |

## Commands

All commands available via `Ctrl+Shift+P` under the `Grass:` category.

- `Grass: Water the grass`
- `Grass: Mow the lawn`
- `Grass: Toggle analytics`
- `Grass: Reset lawn state`
