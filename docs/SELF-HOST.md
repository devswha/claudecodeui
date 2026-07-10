# Self-hosting guide (GajaeCode web UI)

The web UI can run shell commands on the host machine. Treat the server port
like an SSH port: **whoever reaches it (authenticated) controls the machine.**
The defaults below are fail-closed so a fresh install is never exposed by accident.

## Quickstart (same machine)

```sh
npm run build          # once, or use the packaged dist-server
node dist-server/server/cli.js start
# → http://localhost:3001 — create your account on first visit
```

By default the server binds `127.0.0.1` (loopback only). Nothing outside the
machine can reach it, and no login is possible until you create the first
account locally.

## Access from other devices — pick ONE lane

Preferred order: VPN > SSH tunnel > direct bind.

### 1. Tailscale (recommended)

Keeps the server on loopback; Tailscale handles device identity + encryption.

```sh
tailscale serve --bg 3001
# → https://<machine>.<tailnet>.ts.net from any of your devices
```

### 2. SSH tunnel

```sh
ssh -N -L 3001:127.0.0.1:3001 user@server
# → http://localhost:3001 on the client
```

### 3. Direct network bind (last resort)

```sh
node dist-server/server/cli.js start --host 0.0.0.0   # or HOST=0.0.0.0
```

Rules enforced by the server (see `server/utils/exposure-guard.js`):

- **No account yet → the server refuses to start** on a non-loopback host.
  Create the account via loopback first, then restart with `--host`.
  Escape hatch for a trusted network: `ALLOW_REMOTE_SETUP=1` (loud warning).
- Account exists → it starts, with a `[SECURITY]` exposure warning. Auth (JWT,
  bcrypt password) is enforced on every route and WebSocket.

Never port-forward the raw port to the public internet. Use a strong, unique
password — this is a shell, not a blog admin.

## Configuration reference

| Env / flag | Default | Meaning |
|---|---|---|
| `HOST` / `--host` | `127.0.0.1` | Bind address. `0.0.0.0` exposes on all interfaces |
| `SERVER_PORT` / `--port` | `3001` | Listen port |
| `DATABASE_PATH` / `--database-path` | `~/.cloudcli/auth.db` | Auth/settings SQLite |
| `ALLOW_REMOTE_SETUP` | unset | `1` = allow first-run setup on a non-loopback bind (trusted networks only) |
| `JWT_SECRET` | auto-generated per install | Override only if you know why |

## Relationship to the desktop app

The desktop app is a wrapper around this same server: point it at a self-hosted
instance via *Settings → Remote server URL*. Self-hosting first and attaching
clients (browser or desktop) to it is the recommended deployment shape.
