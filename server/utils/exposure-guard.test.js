import { test } from 'node:test';
import assert from 'node:assert/strict';

import { evaluateExposure } from './exposure-guard.js';

test('loopback binds are always ok, with or without users', () => {
    for (const host of ['127.0.0.1', 'localhost', '::1', '[::1]']) {
        for (const hasUsers of [true, false]) {
            const r = evaluateExposure({ host, hasUsers });
            assert.equal(r.level, 'ok', `${host} hasUsers=${hasUsers}`);
            assert.equal(r.reason, 'loopback');
        }
    }
});
test('platform mode without trusted proxy authentication warns for loopback binds', () => {
    const r = evaluateExposure({
        host: '127.0.0.1',
        hasUsers: true,
        isPlatformMode: true,
    });

    assert.equal(r.level, 'warn');
    assert.equal(r.reason, 'platform-loopback-untrusted-proxy');
    assert.match(r.message, /PLATFORM SECURITY WARNING/);
    assert.match(r.message, /remote reverse proxy/);
    assert.match(r.message, /CLOUDCLI_TRUSTED_PROXY_AUTH=1/);
});


test('non-loopback bind with no users is blocked (fail-closed)', () => {
    for (const host of ['0.0.0.0', '::', '192.168.0.10', '100.123.228.51']) {
        const r = evaluateExposure({ host, hasUsers: false });
        assert.equal(r.level, 'block', host);
        assert.equal(r.reason, 'unconfigured-remote');
        assert.match(r.message, /Refusing to listen/);
        assert.match(r.message, /ALLOW_REMOTE_SETUP=1/);
    }
});
test('platform mode blocks non-loopback binds without trusted proxy authentication', () => {
    const r = evaluateExposure({
        host: '0.0.0.0',
        hasUsers: true,
        isPlatformMode: true,
    });

    assert.equal(r.level, 'block');
    assert.equal(r.reason, 'platform-untrusted-proxy');
    assert.match(r.message, /VITE_IS_PLATFORM=true/);
    assert.match(r.message, /CLOUDCLI_TRUSTED_PROXY_AUTH=1/);
});

test('platform mode allows non-loopback binds with trusted proxy authentication', () => {
    const r = evaluateExposure({
        host: '0.0.0.0',
        hasUsers: false,
        isPlatformMode: true,
        trustedProxyAuth: true,
    });

    assert.equal(r.level, 'warn');
    assert.equal(r.reason, 'platform-trusted-proxy');
    assert.match(r.message, /ALL network interfaces/);
    assert.match(r.message, /CLOUDCLI_TRUSTED_PROXY_AUTH=1/);
});

test('non-platform mode preserves the existing exposure policy', () => {
    const unconfigured = evaluateExposure({
        host: '0.0.0.0',
        hasUsers: false,
        isPlatformMode: false,
        trustedProxyAuth: true,
    });
    assert.equal(unconfigured.level, 'block');
    assert.equal(unconfigured.reason, 'unconfigured-remote');

    const configured = evaluateExposure({
        host: '0.0.0.0',
        hasUsers: true,
        isPlatformMode: false,
        trustedProxyAuth: true,
    });
    assert.equal(configured.level, 'warn');
    assert.equal(configured.reason, 'network-exposed');
    assert.match(configured.message, /Authentication is enforced/);
});

test('ALLOW_REMOTE_SETUP=1 downgrades the unconfigured block to a warning', () => {
    const r = evaluateExposure({ host: '0.0.0.0', hasUsers: false, allowRemoteSetup: true });
    assert.equal(r.level, 'warn');
    assert.equal(r.reason, 'remote-setup-override');
    assert.match(r.message, /NO account configured/);
});

test('non-loopback bind with an existing user warns but is allowed', () => {
    const r = evaluateExposure({ host: '0.0.0.0', hasUsers: true });
    assert.equal(r.level, 'warn');
    assert.equal(r.reason, 'network-exposed');
    assert.match(r.message, /Authentication is enforced/);
});

test('wildcard vs specific address is reflected in the message scope', () => {
    const wildcard = evaluateExposure({ host: '0.0.0.0', hasUsers: true });
    assert.match(wildcard.message, /ALL network interfaces/);
    const specific = evaluateExposure({ host: '192.168.0.10', hasUsers: true });
    assert.match(specific.message, /network address 192\.168\.0\.10/);
});

test('allowRemoteSetup does not silence the exposure warning when users exist', () => {
    const r = evaluateExposure({ host: '0.0.0.0', hasUsers: true, allowRemoteSetup: true });
    assert.equal(r.level, 'warn');
    assert.equal(r.reason, 'network-exposed');
});
