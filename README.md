# Aurex Frontend

React + TypeScript + Vite frontend for **Aurex**, a zero-knowledge credential management platform
(*Trust starts with control.*). Formerly API Vault; repository and code names keep the old name.
Backend: [jandales/ApiVault](https://github.com/jandales/ApiVault).

## Zero-knowledge model

Everything sensitive is encrypted in the browser before it reaches the API:

- One password derives, with Argon2id + HKDF, an **authentication key** (sent to the server instead of the password)
  and a **key-encryption key** that unwraps the account's vault key. The password never leaves the browser.
- Secret values (tokens, passwords, usernames, URLs, notes) are encrypted with AES-256-GCM under the vault key, bound
  by AAD to the vault id, secret id and payload version.
- The vault key lives in memory only, as a non-extractable `CryptoKey`. A reload or inactivity locks the app and asks
  for the password again.
- A recovery key, shown once at registration, is the only way to keep secrets after a forgotten password.

Crypto code lives in [`src/security/`](src/security) and is covered by `src/security/vault-crypto.test.ts`.

## Run

Requires Node 20+ and the backend running on `http://localhost:5149` (Vite proxies `/api` there).

```bash
npm install
npm run dev        # http://localhost:5173
```

Point the proxy at another API with `API_PROXY_TARGET=http://localhost:5150 npm run dev`.

## Deploy (Railway)

The `Dockerfile` builds the app and serves it with Caddy (`Caddyfile`), which also proxies `/api/*` to the backend
over Railway's private network, so the browser uses a single origin. Set `API_UPSTREAM`
(e.g. `http://${{api.RAILWAY_PRIVATE_DOMAIN}}:8080`) and generate a public domain for this service.
Full steps: [DEPLOY.md in the backend repo](https://github.com/jandales/ApiVault/blob/master/DEPLOY.md).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Type-check and production build (adds a restrictive Content Security Policy) |
| `npm test` | Crypto unit tests (Vitest) |
| `npm run lint` | Lint (oxlint) |

## Structure

```text
src/
├── app/          routes, layouts, providers (auth, workspace)
├── features/     auth, secrets, tags, overview pages
├── components/   shared UI (icons, menus, item icons)
├── security/     Argon2id, AES-GCM, account and vault crypto, in-memory key manager
├── services/api/ typed API client (access token in memory, refresh token in an HttpOnly cookie)
└── hooks/
```
