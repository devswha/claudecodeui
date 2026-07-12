// Fail-closed self-host exposure policy.
//
// This web UI can run shell commands as the server user, so an unauthenticated,
// network-reachable instance is remote code execution for anyone who can reach
// the port. Policy (self-host-first distribution, 2026-07-10):
//   - loopback bind              → ok (a local user already owns the machine)
//   - non-loopback bind, no user → BLOCK startup: the first-run /register
//                                  endpoint could be claimed by anyone on the
//                                  network. Explicit ALLOW_REMOTE_SETUP=1
//                                  downgrades this to a loud warning.
//   - non-loopback bind, user OK → allow, but print an exposure warning
//                                  (auth is enforced; tunnel/VPN still safer).
//   - VITE_IS_PLATFORM=true      → app-level REST, WebSocket, and agent auth
//                                  are bypassed. CLOUDCLI_TRUSTED_PROXY_AUTH=1
//                                  must be set only when a trusted reverse
//                                  proxy authenticates every forwarded request.
//                                  Without it, non-loopback binds are blocked
//                                  and loopback binds print a loud warning.
import { isLoopbackHost, isWildcardHost } from '../../shared/networkHosts.js';

/**
 * Decide whether the server may listen on `host`.
 *
 * Pure function — no process/env/db access — so the policy is unit-testable.
 *
 * @param {object} input
 * @param {string} input.host bind address (e.g. '127.0.0.1', '0.0.0.0')
 * @param {boolean} input.hasUsers at least one account exists in the auth DB
 * @param {boolean} [input.allowRemoteSetup] explicit ALLOW_REMOTE_SETUP=1 opt-in
 * @param {boolean} [input.isPlatformMode] app-level authentication is bypassed
 * @param {boolean} [input.trustedProxyAuth] trusted reverse proxy enforces authentication
 * @returns {{level: 'ok'|'warn'|'block', reason: string, message?: string}}
 */
export function evaluateExposure({
    host,
    hasUsers,
    allowRemoteSetup = false,
    isPlatformMode = false,
    trustedProxyAuth = false,
}) {
    const isLoopback = isLoopbackHost(host);
    const scope = isWildcardHost(host)
        ? 'ALL network interfaces'
        : `network address ${host}`;

    if (isPlatformMode) {
        if (!trustedProxyAuth) {
            if (isLoopback) {
                return {
                    level: 'warn',
                    reason: 'platform-loopback-untrusted-proxy',
                    message:
                        '\n' +
                        '════════════════════ PLATFORM SECURITY WARNING ════════════════════\n' +
                        'VITE_IS_PLATFORM=true disables REST, WebSocket, and agent authentication.\n' +
                        'This loopback server is safe only while no remote reverse proxy forwards\n' +
                        'requests to it. Forwarded remote requests are unauthenticated and can run\n' +
                        'shell commands. Configure proxy authentication for every request, then set\n' +
                        'CLOUDCLI_TRUSTED_PROXY_AUTH=1 to acknowledge that protection.\n' +
                        '══════════════════════════════════════════════════════════════════════',
                };
            }

            return {
                level: 'block',
                reason: 'platform-untrusted-proxy',
                message:
                    `Refusing to listen on ${scope}: VITE_IS_PLATFORM=true disables REST, ` +
                    'WebSocket, and agent authentication. Configure a trusted reverse proxy to ' +
                    'authenticate every forwarded request, then explicitly acknowledge it with ' +
                    'CLOUDCLI_TRUSTED_PROXY_AUTH=1.',
            };
        }

        if (!isLoopback) {
            return {
                level: 'warn',
                reason: 'platform-trusted-proxy',
                message:
                    `CLOUDCLI_TRUSTED_PROXY_AUTH=1 — listening on ${scope} in platform mode. ` +
                    'REST, WebSocket, and agent authentication are bypassed by this server; ' +
                    'ensure the trusted reverse proxy authenticates every forwarded request.',
            };
        }
    }

    if (isLoopback) {
        return { level: 'ok', reason: 'loopback' };
    }

    if (!hasUsers) {
        if (!allowRemoteSetup) {
            return {
                level: 'block',
                reason: 'unconfigured-remote',
                message:
                    `Refusing to listen on ${scope}: no account exists yet, so anyone who can ` +
                    'reach this port could register the first account and gain shell access.\n' +
                    'Fix: start with the default loopback bind (leave HOST unset), create your ' +
                    'account at http://localhost:<port>, then restart with your desired HOST.\n' +
                    'Override for a trusted network only: ALLOW_REMOTE_SETUP=1.',
            };
        }
        return {
            level: 'warn',
            reason: 'remote-setup-override',
            message:
                `ALLOW_REMOTE_SETUP=1 — listening on ${scope} with NO account configured. ` +
                'Create the first account immediately: until then, anyone who can reach this ' +
                'port can register and gain shell access.',
        };
    }

    return {
        level: 'warn',
        reason: 'network-exposed',
        message:
            `Listening on ${scope}. Authentication is enforced, but this UI can run shell ` +
            'commands on this machine — prefer a VPN (e.g. tailscale serve) or an SSH tunnel ' +
            'over exposing the port directly.',
    };
}
