# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development workflow

### Commits
- One commit per logical change (fix, feature, refactor, docs, chore). Do not bundle unrelated changes.
- Version bumps are always a separate commit — never fold them into a fix or feature commit.
- Use **Conventional Commits** format: `fix:`, `feat:`, `chore:`, `docs:`, `refactor:`, `test:`.
- Run `npm run typecheck` before every commit that touches `src/`. Block and report if it fails.
- After completing a fix or feature, suggest a version bump but wait for explicit confirmation before doing it.

### Version bumps
- Run `npm version patch --no-git-tag-version` then commit with message `chore: bump version to x.x.x`.
- Patch for fixes, minor for new features, major for breaking changes.

## Commands

```bash
npm run dev          # Start Electron with hot-reload (renderer only; main requires restart)
npm run build        # Compile with electron-vite + package all targets
npm run build:win    # Windows targets only (NSIS, MSI, portable)
npm run build:msi    # MSI only
npm run typecheck    # Type-check main and renderer separately (no emit)
```

No test suite exists yet.

## Architecture

Standard Electron app with three isolated processes:

```
Main (Node.js)          Preload             Renderer (sandboxed)
main.ts                 index.ts            renderer.ts  ← widget window
ipc-handlers.ts   →  contextBridge  →      admin.ts     ← settings window
unifi-api.ts            window.api          about.ts
keychain.ts
store.ts
```

**Main process** is the only process with network or filesystem access. All NVR calls and config reads/writes happen here.

**Preload** (`src/preload/index.ts`) is the sole bridge. It exposes `window.api` to both renderer windows via `contextBridge`. The full typed surface is in `src/shared/types.ts` (`UnifiApi`). When adding a new IPC channel: add the handler in `ipc-handlers.ts`, expose it in `preload/index.ts`, and add the type to `UnifiApi` in `shared/types.ts`.

**Renderers** have no Node access (`sandbox: true`, `contextIsolation: true`). They communicate exclusively through `window.api`.

## IPC flow for state updates

The main process pushes two events to the widget renderer:
- `unifi:active-view-changed` — fired after a successful liveview switch (from tray, hotkey, or renderer click)
- `config:changed` — fired after `config:save`, carries the full updated config

The renderer does not poll for config. It polls for the active liveview on an interval (`pollIntervalSec`, default 60s) via `unifi:get-active-liveview` to stay in sync if the viewport is changed externally.

## Secrets

`keychain.ts` wraps `safeStorage` (OS-level DPAPI on Windows). The API key and admin password are encrypted before being written to the electron-store JSON. The API key is **never** sent to any renderer — main reads it directly from keychain when making NVR requests.

## i18n

All user-visible strings live in `src/renderer/i18n/en.ts` (source of truth) and `src/renderer/i18n/de.ts`. The `de` file is typed as `typeof en`, so a missing or mistyped key is a compile error caught by `npm run typecheck`. Never hardcode English strings in `.ts` or `.html` files — always go through `t.keyName`.

## MSI packaging known issue

`node_modules/app-builder-lib/out/targets/MsiTarget.js` contains a patch (line ~204) that sanitizes WiX `File` element IDs by replacing non-alphanumeric characters with underscores. Without this patch, files like `icudtl.dat` and `v8_context_snapshot.bin` are silently omitted from the MSI because WiX rejects IDs containing dots. This patch will be lost on `npm install` and must be reapplied. The `-sval` flag in `electron-builder.json` suppresses WiX validation, which is what hides the failure without the patch.

## Config location

```
%APPDATA%\unifi-viewport-liveview-switcher\config.json   ← store (non-secret)
%APPDATA%\unifi-viewport-liveview-switcher\logs\         ← electron-log output
```

Delete `config.json` to reset all settings. Remove `encryptedAdminPass` from it to reset only the admin password.
