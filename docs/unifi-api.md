# UniFi Protect API

The app talks directly to the local UniFi Protect NVR over HTTPS. No cloud connectivity is required or used.

## Authentication

Every request includes the header:

```
X-API-KEY: <your API key>
Accept: application/json
```

Generate an API key in the Protect web UI under **Settings → API**.

## Base URL

```
https://<nvrHost>/proxy/protect/integration/v1
```

`nvrHost` is the IP address or hostname of the NVR on your local network.

## TLS

UniFi NVRs use self-signed certificates by default. If you see TLS errors, enable **Skip TLS certificate verification** in the settings. This disables certificate validation for NVR requests only.

## Endpoints Used

### GET `/viewers`

Returns all Viewport devices on the NVR.

Response (array):
```json
[
  { "id": "abc123", "name": "Living Room Viewport", "modelKey": "viewer" }
]
```

### GET `/liveviews`

Returns all saved liveviews.

Response (array):
```json
[
  { "id": "def456", "name": "Front Cameras", "isDefault": true },
  { "id": "ghi789", "name": "Back Cameras", "isDefault": false }
]
```

### GET `/viewers/:viewportId`

Returns the current state of a specific Viewport, including its active liveview.

Response:
```json
{
  "id": "abc123",
  "liveview": { "id": "def456" }
}
```

If no liveview is set, the `liveview` key may be absent.

### PATCH `/viewers/:viewportId`

Sets the active liveview on a Viewport.

Request body:
```json
{ "liveview": "def456" }
```

Response: 200 with the updated viewer object on success.

## Error Handling

Any non-2xx response throws a `UnifiApiError` with the HTTP status code attached. The IPC layer surfaces this as a rejected promise, which the renderer catches and displays as an error message.
