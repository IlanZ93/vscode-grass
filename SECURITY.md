# Security Policy

## Scope

vscode-grass is a purely cosmetic VS Code extension. It:

- stores data only in VS Code's `globalState` (local to your machine)
- makes no network requests
- runs entirely in a sandboxed webview with a strict Content Security Policy
- has no backend, no telemetry, no authentication

The attack surface is minimal, but reports are still welcome.

## Supported versions

| Version | Supported |
|---------|-----------|
| Latest  | ✅        |
| Older   | ❌        |

Always update to the latest release before reporting.

## Reporting a vulnerability

**Do not open a public issue for security vulnerabilities.**

Report privately via GitHub's [Security Advisories](https://github.com/IlanZ93/vscode-grass/security/advisories/new) or by emailing the maintainer directly.

Please include:
- Description of the issue
- Steps to reproduce
- Potential impact

You can expect an acknowledgement within 7 days.
