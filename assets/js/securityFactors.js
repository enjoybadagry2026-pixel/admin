// ═══════════════ EBASK / WEBAUTHN SECURITY FACTORS ═══════════════
(function () {
  'use strict';
  function id(value) { return document.getElementById(value); }
  function message(error) { var box = id('pf-ebask-err'); if (box) box.textContent = error && error.message ? error.message : ''; }
  function b64ToBytes(value) { var text = String(value).replace(/-/g, '+').replace(/_/g, '/'); while (text.length % 4) text += '='; var raw = atob(text); var out = new Uint8Array(raw.length); for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i); return out; }
  function bytesToB64(buffer) { var bytes = new Uint8Array(buffer), text = ''; for (var i = 0; i < bytes.length; i++) text += String.fromCharCode(bytes[i]); return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function publicKeyOptions(options) {
    var copy = JSON.parse(JSON.stringify(options));
    copy.challenge = b64ToBytes(copy.challenge); copy.user.id = b64ToBytes(copy.user.id);
    (copy.excludeCredentials || []).forEach(function (x) { x.id = b64ToBytes(x.id); }); return copy;
  }
  function authenticationOptions(options) {
    var copy = JSON.parse(JSON.stringify(options)); copy.challenge = b64ToBytes(copy.challenge); (copy.allowCredentials || []).forEach(function (x) { x.id = b64ToBytes(x.id); }); return copy;
  }
  function serializeCredential(credential) {
    if (!credential) return null;
    var response = credential.response || {}; var result = { id: credential.id, rawId: bytesToB64(credential.rawId), type: credential.type, response: {} };
    ['clientDataJSON', 'attestationObject', 'authenticatorData', 'signature', 'userHandle'].forEach(function (key) { if (response[key]) result.response[key] = bytesToB64(response[key]); });
    if (response.getTransports) result.response.transports = response.getTransports();
    return result;
  }
  function renderKeys(keys) {
    var status = id('pf-ebask-status'), box = id('pf-ebask-keys'); if (!status || !box) return;
    var active = (keys || []).filter(function (x) { return !x.revoked_at; }); status.textContent = active.length ? active.length + ' active security key' + (active.length === 1 ? '' : 's') + ' registered.' : 'No EBASK security key is registered.';
    box.innerHTML = (keys || []).map(function (key) { return '<div class="pf-session"><strong>' + String(key.key_id).slice(0, 8) + '…</strong><span>' + (key.revoked_at ? 'Revoked' : 'Active') + '</span>' + (!key.revoked_at ? '<button class="btn btn-ghost btn-sm" onclick="pfRevokeEbask(\'' + String(key.key_id).replace(/'/g, '') + '\')">Revoke</button>' : '') + '</div>'; }).join('');
  }
  async function load() { try { var response = await api('GET', '/security/ebask'); renderKeys(response.data || []); } catch (e) { message(e); } }
  window.pfEnrollEbask = async function () {
    var input = id('pf-ebask-passphrase'); var passphrase = input && input.value; message(null);
    if (!passphrase || passphrase.length < 12) { message(new Error('Choose a passphrase of at least 12 characters.')); return; }
    var button = id('pf-ebask-enroll'); if (button) button.disabled = true;
    try {
      var response = await api('POST', '/security/ebask/enroll', { passphrase: passphrase });
      var blob = new Blob([JSON.stringify(response.data.file)], { type: 'application/vnd.enjoybadagry.ebask+json' }); var link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = response.data.fileName || 'EnjoyBadagry-Security.ebask'; link.click(); setTimeout(function () { URL.revokeObjectURL(link.href); }, 1000); input.value = ''; alert('Your security key was downloaded. Store the .ebask file securely; it cannot be recovered from this browser.'); await load();
    } catch (e) { message(e); } finally { if (button) button.disabled = false; }
  };
  function webAuthnError(error) {
    if (error && error.code === 'STEP_UP_REQUIRED') return new Error('Additional security verification is required. Enter your six-digit Super Security code.');
    if (error && error.code === 'WEBAUTHN_ORIGIN_NOT_ALLOWED') return new Error('This browser address is not configured for passkey registration.');
    if (error && error.code === 'WEBAUTHN_CONFIGURATION_INVALID') return new Error('Passkey registration is not configured for this admin domain.');
    if (error && error.code === 'WEBAUTHN_CHALLENGE_INVALID') return new Error('Your passkey registration expired or was already used. Please try again.');
    if (error && error.code === 'WEBAUTHN_CREDENTIAL_EXISTS') return new Error('This passkey is already registered on an account.');
    if (error && error.code === 'WEBAUTHN_REGISTRATION_FAILED') return new Error('Passkey registration could not be verified. Please try again.');
    if (error && error.code === 'WEBAUTHN_NOT_ENROLLED') return new Error('Register a passkey before using hardware-backed security.');
    if (error && error.name === 'SecurityError') return new Error('This browser address is not configured for passkey registration. Use the approved HTTPS admin domain or the configured local address.');
    if (error && error.name === 'NotAllowedError') return new Error('Passkey registration was cancelled or timed out.');
    if (error && error.name === 'InvalidStateError') return new Error('This passkey is already registered on this account.');
    if (error && error.name === 'NotSupportedError') return new Error('This device does not support the requested passkey method.');
    if (error && error.name === 'AbortError') return new Error('Passkey registration was cancelled.');
    return error;
  }
  window.pfRegisterPasskey = async function () {
    message(null); if (!window.PublicKeyCredential || !navigator.credentials) { message(new Error('This browser does not support WebAuthn passkeys.')); return; }
    if (!window.isSecureContext) { message(new Error('Passkeys require HTTPS, except for approved localhost or loopback development addresses.')); return; }
    var button = document.querySelector('[onclick="pfRegisterPasskey()"]'); if (button) button.disabled = true;
    try { var options = (await api('POST', '/security/webauthn/register/options', {})).data; var credential = await navigator.credentials.create({ publicKey: publicKeyOptions(options) }); if (!credential) throw new Error('Passkey registration was cancelled.'); await api('POST', '/security/webauthn/register/verify', { response: serializeCredential(credential), name: 'Administrator passkey' }); alert('Passkey registered successfully.'); } catch (e) { message(webAuthnError(e)); } finally { if (button) button.disabled = false; }
  };
  window.pfRevokeEbask = async function (keyId) { if (!confirm('Revoke this security key? A copied file will stop working immediately.')) return; try { await api('POST', '/security/ebask/' + encodeURIComponent(keyId) + '/revoke', { reason: 'Administrator requested revocation' }); await load(); } catch (e) { message(e); } };
  window.ebaskAuthenticate = async function (operation, targetHash, keyId, file, passphrase) {
    var challenge = (await api('POST', '/security/ebask/challenge', { operation: operation, targetHash: targetHash, keyId: keyId })).data;
    var text = JSON.stringify(file), header = { format: file.format, version: file.version, keyId: file.keyId, algorithm: file.algorithm, kdf: file.kdf, iterations: file.iterations, salt: file.salt, iv: file.iv };
    var keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), { name: 'PBKDF2' }, false, ['deriveKey']); var aes = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: b64ToBytes(file.salt), iterations: file.iterations, hash: 'SHA-256' }, keyMaterial, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    var encrypted = b64ToBytes(file.ciphertext + ''); var tag = b64ToBytes(file.tag); var combined = new Uint8Array(encrypted.length + tag.length); combined.set(encrypted); combined.set(tag, encrypted.length); var plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64ToBytes(file.iv), additionalData: new TextEncoder().encode(JSON.stringify(header)), tagLength: 128 }, aes, combined); var privateKey = await crypto.subtle.importKey('pkcs8', b64ToBytes(JSON.parse(new TextDecoder().decode(plain)).privateKey), { name: 'Ed25519' }, false, ['sign']); var signature = await crypto.subtle.sign('Ed25519', privateKey, new TextEncoder().encode(challenge.challenge)); return (await api('POST', '/security/ebask/verify', { challengeId: challenge.challengeId, operation: operation, targetHash: targetHash, signature: bytesToB64(signature) })).data;
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load); else load();
}());
