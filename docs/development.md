# Development Guide

## Prerequisites

- Node.js 20+
- npm

## Setup

```bash
npm install
```

## Running in Development

```bash
npm run dev
```

This starts the electron-vite dev server and launches Electron. Hot-reload is active for renderer code. Main process changes require a restart.

**Note:** In dev mode the admin window URL is derived from `ELECTRON_RENDERER_URL` by appending `/admin.html`. The env var is set automatically by electron-vite.

## Type Checking

```bash
npm run typecheck
```

## Building

Build for the current platform:

```bash
npm run build
```

Build specifically for Windows:

```bash
npm run build:win
```

Output goes to `out/` (compiled JS) and `dist/` (installer, produced by electron-builder).

## Project Structure

```
unifi-viewport-liveview-switcher/
├── src/
│   ├── main/               # Electron main process
│   │   ├── main.ts         # Window management, tray, app lifecycle
│   │   ├── ipc-handlers.ts # All IPC handler registrations
│   │   ├── unifi-api.ts    # UniFi Protect HTTP client
│   │   ├── keychain.ts     # Encrypted storage (API key + admin password)
│   │   └── store.ts        # electron-store config schema + instance
│   ├── preload/
│   │   └── index.ts        # contextBridge API exposed as window.api
│   ├── renderer/
│   │   ├── index.html      # Main widget window
│   │   ├── admin.html      # Settings window
│   │   ├── renderer.ts     # Widget logic
│   │   ├── admin.ts        # Settings window logic
│   │   └── styles.css      # Shared styles for both windows
│   └── shared/
│       └── types.ts        # Shared TypeScript types (AppConfig, LiveviewInfo, UnifiApi)
├── electron.vite.config.ts # electron-vite build config
├── package.json
└── README.md
```

## Tech Stack

| Layer | Technology |
|---|---|
| App shell | Electron 31 |
| Build tool | electron-vite 2 + Vite 5 |
| Language | TypeScript 5 |
| Renderer | Vanilla TS, no framework |
| HTTP client | undici 6 |
| Config storage | electron-store 8 |
| Encryption | Electron safeStorage (OS keychain-backed) |
| Packaging | electron-builder 24 |

## Adding Translations

All user-visible strings must go through the i18n system — never hardcode English text in `.ts` or `.html` files.

**Files:**
- `src/renderer/i18n/en.ts` — source of truth; defines the `Strings` type via `typeof en`
- `src/renderer/i18n/de.ts` — German; must satisfy `Strings` (TypeScript enforces this)
- `src/renderer/i18n/index.ts` — picks locale at runtime based on `navigator.language`

**Checklist when adding a new feature with UI text:**

1. Add the key(s) to `en.ts` with the English value.
2. Add the same key(s) to `de.ts` with the German translation. Because `de` is typed as `Strings`, TypeScript will error if a key is missing or has the wrong type.
3. In `.ts` renderer code, reference strings as `t.yourKey` — never use a string literal directly.
4. In `.html` files, use a neutral placeholder (or leave the static text in English) — `admin.ts` overwrites it at runtime via `element.textContent = t.yourKey`.
5. Run `npm run typecheck` — a missing or mistyped key in `de.ts` is a compile error.

**Dynamic strings** (strings that include a variable) are functions:
```ts
// en.ts
opacityLabel: (pct: number) => `Window opacity: ${pct}%`,

// usage
lblOpacity.textContent = t.opacityLabel(pct)
```

## Resetting State

Config is stored at:
```
%APPDATA%\unifi-viewport-liveview-switcher\config.json
```

Delete this file to reset all settings. To clear only the admin password, open the file and remove the `encryptedAdminPass` key. The app treats a missing password as first-run and will prompt you to set a new one.
