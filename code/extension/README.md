# ApplyAI Extension (Phase 1 Scaffold)

This package contains the Plasmo MV3 extension foundation for ApplyAI.

## Scope

- Curated host permissions only
- Popup foundation
- Background service worker foundation
- Content script bootstrap on supported domains
- Shared auth/API/SSE utilities for future phases
- Phase 3 account connect handshake (Option A)

## Commands

```bash
pnpm --dir extension dev
pnpm --dir extension build
pnpm --dir extension package
```

From the workspace root, equivalent shortcuts are:

```bash
pnpm ext:dev
pnpm ext:build
pnpm ext:package
```

## Environment

Set extension endpoints via:

- `.env.development`
- `.env.production`

Variables:

- `PLASMO_PUBLIC_API_BASE_URL`
- `PLASMO_PUBLIC_WEB_APP_BASE_URL`

## Connect Account Handshake (Phase 3)

This package now implements the locked Option A connect flow:

1. Popup sends `applyai.connect.start` to the background service worker.
2. Background generates a nonce, stores it in extension local storage, and opens:
	- `${WEB_APP_BASE_URL}/dashboard/extension-connect?nonce=...&ext=...`
3. Web app connect page reads browser auth tokens and sends `applyai.connect.complete` to the target extension ID.
4. Background accepts only external messages from the configured web origin and validates nonce replay protection.
5. On success, extension session tokens are persisted in extension storage.

### Security Notes

- External connect messages are restricted via `externally_connectable.matches` in `package.json`.
- Background enforces exact origin checks against `PLASMO_PUBLIC_WEB_APP_BASE_URL` origin.
- Nonce must match the pending stored value before tokens are accepted.

### Troubleshooting

- `Unauthorized sender`: extension rejected message origin; verify `PLASMO_PUBLIC_WEB_APP_BASE_URL` and manifest matches.
- `Invalid nonce`: connect flow expired or replayed; click Connect Account again from popup.
- `runtime is not available`: open the connect URL in Chrome with the extension installed/enabled.

## Popup Readiness Flow (Current)

The popup now supports local readiness checks directly:

1. Account session status from extension token storage.
2. BYOK key workflow:
	- Enter Gemini and Cohere keys in popup.
	- Click `Validate & Save`.
	- Extension validates keys via `/settings/validate-keys` before saving.
3. Profile ingest status workflow:
	- Popup fetches `/profile` when authenticated.
	- `ingested_at` is mapped to `Profile ingest: Ready` or `Needs ingest`.
	- `Refresh Status` triggers a manual re-sync.

Notes:

- BYOK keys are stored in `chrome.storage.local` under extension scope.
- Validation is required before keys are persisted.
- If session expires, reconnect account from popup and retry.