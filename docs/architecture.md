# Architecture

## Overview

The app is a standard Electron application with three processes communicating over IPC:

```
┌─────────────────────────────────────────┐
│  Main Process (Node.js)                 │
│  main.ts · ipc-handlers.ts              │
│  unifi-api.ts · keychain.ts · store.ts  │
└────────────┬────────────────────────────┘
             │ contextBridge (window.api)
    ┌────────┴──────────┐
    │    Preload        │
    │    index.ts       │
    └────────┬──────────┘
             │
  ┌──────────┴──────────────────┐
  │  Renderer (sandboxed)       │
  │                             │
  │  index.html / renderer.ts   │  ← widget window
  │  admin.html / admin.ts      │  ← settings window
  └─────────────────────────────┘
```

Both renderer windows share a single preload script and the same `window.api` surface. The main process is the only process with network access or filesystem access.

## Main Process

### `main.ts`

Creates and manages two `BrowserWindow` instances:

- **mainWindow** — the compact widget. Frameless, resizable, persists its bounds in the store between sessions.
- **adminWindow** — the settings panel. Created on demand when `window:open-admin` IPC is received; destroyed on close. Has `mainWindow` as its parent.

Also creates a system tray icon with Show / Quit options.

### `ipc-handlers.ts`

Registers all `ipcMain.handle` listeners. Groups:

- `unifi:*` — live NVR operations (switch liveview, get active liveview, fetch viewports/liveviews for setup)
- `config:*` — read/write app config, password management
- `window:*` — always-on-top toggle, open admin window

After a `config:save`, the main process broadcasts `config:changed` to the widget window so it can refresh without polling.

After a `unifi:switch-liveview`, the main process broadcasts `unifi:active-view-changed` to the widget window so the active button updates immediately.

### `unifi-api.ts`

Thin HTTP client over the UniFi Protect local API. Uses `undici` for fetch. All requests go to `https://<nvrHost>/proxy/protect/integration/v1/...` with `X-API-KEY` authentication.

Endpoints used:

| Function | Method | Path |
|---|---|---|
| `getViewports` | GET | `/viewers` |
| `getLiveviews` | GET | `/liveviews` |
| `getActiveView` | GET | `/viewers/:viewportId` |
| `setActiveView` | PATCH | `/viewers/:viewportId` |

When `skipTlsVerify` is true, a custom `undici.Agent` is created with `rejectUnauthorized: false` to handle self-signed NVR certificates.

### `keychain.ts`

Wraps Electron's `safeStorage` API (OS-level encryption) to encrypt two secrets before writing them to the electron-store JSON file:

- **API key** — stored under `encryptedApiKey`
- **Admin password** — stored under `encryptedAdminPass`

`safeStorage` ties encryption to the OS user account, so the secrets are unreadable on a different machine or user account even if the config file is copied.

### `store.ts`

An `electron-store` instance with a typed schema. Stores non-secret config as plain JSON at `%APPDATA%\unifi-viewport-liveview-switcher\config.json`.

Schema fields:

| Field | Type | Description |
|---|---|---|
| `nvrHost` | string | IP or hostname of the NVR |
| `viewportId` | string | ID of the controlled Viewport device |
| `viewportName` | string | Display name of the Viewport (cached) |
| `liveviews` | LiveviewInfo[] | User's liveview list with enabled flags and custom names |
| `alwaysOnTop` | boolean | Whether the widget starts pinned on top |
| `skipTlsVerify` | boolean | Skip TLS cert verification for the NVR |
| `configured` | boolean | True once viewportId and nvrHost have both been saved |
| `windowBounds` | object | Persisted x/y/width/height of the widget window |

Encrypted fields (`encryptedApiKey`, `encryptedAdminPass`) are written directly by `keychain.ts` outside the typed schema.

## Preload

`index.ts` uses `contextBridge.exposeInMainWorld('api', ...)` to expose a typed API object to both renderer windows. The sandbox is enabled (`sandbox: true`, `contextIsolation: true`), so renderers have no access to Node.js APIs — all privileged operations go through `window.api`.

## Renderer

### Widget window (`index.html` / `renderer.ts`)

Displays liveview buttons for all enabled liveviews. On click, calls `window.api.switchLiveview(id)`. Listens to `onActiveViewChanged` and `onConfigChanged` events to stay in sync without polling.

The gear icon triggers the settings flow:
1. Calls `window.api.isFirstRun()`.
2. If first-run (no password set): shows the **Set Admin Password** overlay.
3. Otherwise: shows the **Unlock** password overlay.
4. On success: calls `window.api.openAdmin()` to open the settings window.

### Settings window (`admin.html` / `admin.ts`)

Three-step setup flow rendered in a single scrollable panel:

1. **NVR Connection** — enter NVR host + API key, click Connect to fetch Viewport list.
2. **Viewport** — select the target Viewport, click Load Liveviews.
3. **Liveviews** — check/uncheck liveviews, optionally set custom display names.

Plus **Appearance** (always-on-top default) and **Admin Password** (change password) sections.

On save, calls `window.api.saveConfig(...)` which triggers `config:changed` back to the widget.

## Security Notes

- Renderers run in a sandbox with no Node access.
- The API key is never sent to the renderer; it is only read by the main process from `keychain.ts` when making NVR requests.
- The admin password is never returned to the renderer; verification happens in the main process.
- `skipTlsVerify` disables certificate validation for the NVR only — it is opt-in and scoped to NVR requests.
