# IPC API Reference

All communication between the renderer and main process goes through `window.api`, exposed via the preload script using Electron's `contextBridge`. Both the widget window and the settings window share this API.

## Invokable methods

### Liveview switching

#### `window.api.switchLiveview(liveviewId)`
Switches the active liveview on the configured Viewport.

| | |
|---|---|
| Args | `liveviewId: string` |
| Returns | `Promise<{ ok: true }>` |
| Side effect | Main process broadcasts `unifi:active-view-changed` to the widget window |

#### `window.api.getActiveLiveview()`
Reads the currently active liveview from the NVR.

| | |
|---|---|
| Returns | `Promise<{ liveviewId: string \| null }>` |

---

### Setup (admin window only)

#### `window.api.fetchViewports(nvrHost, apiKey, skipTls)`
Connects to the NVR with the provided credentials and returns all Viewport devices. Used during initial setup before credentials are saved.

| | |
|---|---|
| Args | `nvrHost: string`, `apiKey: string`, `skipTls: boolean` |
| Returns | `Promise<Array<{ id: string; name: string }>>` |

#### `window.api.fetchLiveviews(nvrHost, apiKey, skipTls, viewportId)`
Returns all liveviews defined on the NVR. `viewportId` is accepted but currently unused (reserved for future per-viewport filtering).

| | |
|---|---|
| Args | `nvrHost: string`, `apiKey: string`, `skipTls: boolean`, `viewportId: string` |
| Returns | `Promise<Array<{ id: string; name: string }>>` |

---

### Config

#### `window.api.getConfig()`
Returns the current application config.

| | |
|---|---|
| Returns | `Promise<AppConfig>` |

`AppConfig` fields:

| Field | Type | Description |
|---|---|---|
| `nvrHost` | string | NVR IP or hostname |
| `viewportId` | string | Selected Viewport device ID |
| `viewportName` | string | Selected Viewport display name |
| `liveviews` | `LiveviewInfo[]` | Liveview list with enable flags and custom names |
| `alwaysOnTop` | boolean | Current always-on-top preference |
| `skipTlsVerify` | boolean | TLS skip setting |
| `hasPassword` | boolean | Whether an admin password is set |
| `configured` | boolean | Whether setup has been completed |

Note: the API key is never returned to the renderer. It can only be written.

#### `window.api.saveConfig(config)`
Partially updates the stored config. Only fields present in the payload are written.

| | |
|---|---|
| Args | `Partial<AppConfig> & { apiKey?: string }` |
| Returns | `Promise<{ ok: true }>` |
| Side effect | Main process broadcasts `config:changed` to the widget window |

Passing `apiKey` saves it to encrypted storage. Leaving it out keeps the existing stored key.

---

### Password

#### `window.api.isFirstRun()`
Returns `true` if no admin password has been set yet.

| | |
|---|---|
| Returns | `Promise<{ firstRun: boolean }>` |

#### `window.api.verifyPassword(password)`
Checks a password against the stored encrypted value.

| | |
|---|---|
| Args | `password: string` |
| Returns | `Promise<{ ok: boolean }>` |

#### `window.api.setPassword(password)`
Encrypts and stores a new admin password.

| | |
|---|---|
| Args | `password: string` |
| Returns | `Promise<{ ok: true }>` |

---

### Window

#### `window.api.getAlwaysOnTop()`

| | |
|---|---|
| Returns | `Promise<{ alwaysOnTop: boolean }>` |

#### `window.api.toggleAlwaysOnTop()`
Toggles the main window's always-on-top state and persists the new value.

| | |
|---|---|
| Returns | `Promise<{ alwaysOnTop: boolean }>` |

#### `window.api.openAdmin()`
Opens the settings window (or focuses it if already open).

| | |
|---|---|
| Returns | `Promise<void>` |

---

## Events from main process

These are push events sent by the main process; the renderer subscribes with a callback. Both return an unsubscribe function.

#### `window.api.onActiveViewChanged(callback)`
Fired after a successful liveview switch.

| | |
|---|---|
| Callback | `(liveviewId: string) => void` |
| Returns | `() => void` — unsubscribe function |

#### `window.api.onConfigChanged(callback)`
Fired after `saveConfig` completes. Only sent to the widget window, not to the settings window.

| | |
|---|---|
| Callback | `(config: AppConfig) => void` |
| Returns | `() => void` — unsubscribe function |

---

## IPC channel names

For reference, the raw Electron IPC channel strings used under the hood:

| `window.api` method | Channel |
|---|---|
| `switchLiveview` | `unifi:switch-liveview` |
| `getActiveLiveview` | `unifi:get-active-liveview` |
| `fetchViewports` | `unifi:fetch-viewports` |
| `fetchLiveviews` | `unifi:fetch-liveviews` |
| `getConfig` | `config:get` |
| `saveConfig` | `config:save` |
| `verifyPassword` | `config:verify-password` |
| `setPassword` | `config:set-password` |
| `isFirstRun` | `config:is-first-run` |
| `getAlwaysOnTop` | `window:get-always-on-top` |
| `toggleAlwaysOnTop` | `window:toggle-always-on-top` |
| `openAdmin` | `window:open-admin` |
| `onActiveViewChanged` | `unifi:active-view-changed` (push) |
| `onConfigChanged` | `config:changed` (push) |
