// Database mutation three-factor verification modal.
(function () {
  'use strict';
  var pending = null;
  function id(value) { return document.getElementById(value); }
  function esc(value) { var node = document.createElement('div'); node.textContent = value == null ? '' : String(value); return node.innerHTML; }
  function setStep(name, state, label) { var el = id('dbSecurityStep' + name); if (el) { el.textContent = label || state; el.className = 'db-security-step-state ' + state; el.dataset.state = state; } updateProgress(); }
  function setFooterStatus(text, state) { var el = id('dbSecurityFooterStatus'); if (el) { el.textContent = text; el.className = 'db-security-footer-status' + (state ? ' ' + state : ''); } }
  function updateProgress() {
    var names = ['Passcode', 'Passkey', 'Ebask'];
    var done = names.filter(function (name) { var el = id('dbSecurityStep' + name); return el && el.dataset.state === 'verified'; }).length;
    var failed = names.some(function (name) { var el = id('dbSecurityStep' + name); return el && el.dataset.state === 'failed'; });
    var working = names.some(function (name) { var el = id('dbSecurityStep' + name); return el && el.dataset.state === 'working'; });
    var progress = id('dbSecurityProgress'); if (progress) progress.textContent = done + ' of 3 security checks complete';
    var save = id('dbSecuritySave'); if (save) save.disabled = !(pending && pending.verified);
    if (pending && pending.verified) setFooterStatus('All three checks passed', 'verified');
    else if (failed) setFooterStatus(done + ' of 3 verified — action failed', 'failed');
    else if (working) setFooterStatus('Verifying… ' + done + ' of 3');
    else setFooterStatus(done ? done + ' of 3 verified' : 'Not verified', '');
    var passcodeReady = id('dbSecurityStepPasscode') && id('dbSecurityStepPasscode').dataset.state === 'verified';
    var run = id('dbSecurityPasskeyRun'); if (run) run.disabled = !!(!passcodeReady || working || (pending && pending.verified));
  }
  function showError(message) { var el = id('dbSecurityError'); if (el) el.textContent = message || ''; }
  function close(result, failure) { var modal = id('dbSecurityModal'); if (modal) { modal.classList.remove('on'); modal.setAttribute('aria-hidden', 'true'); } var current = pending; pending = null; if (current) failure ? current.reject(failure) : current.resolve(result); }
  function formatValue(value) { if (value === null || value === undefined) return '<span class="db-security-null">null</span>'; if (typeof value === 'object') return '<code>' + esc(JSON.stringify(value, null, 2)) + '</code>'; return esc(value); }
  function masked(value, key) { return /password|token|secret|credential|private|hash|passcode|bvn|nin/i.test(String(key || '')) ? '[redacted]' : value; }
  function formatPlain(value) { if (value === null || value === undefined) return 'null'; if (typeof value === 'object') return JSON.stringify(value); return String(value); }
  function renderChanges(review) {
    var box = id('dbSecurityChanges'); if (!box) return;
    if (!review) { box.innerHTML = '<div class="db-security-empty">No change preview was supplied.</div>'; return; }
    var original = review.original, proposed = review.proposed;
    if (Array.isArray(original) || Array.isArray(proposed)) {
      var before = Array.isArray(original) ? original : [], after = Array.isArray(proposed) ? proposed : [];
      var columns = {};
      before.concat(after).forEach(function (row) { if (row && typeof row === 'object' && !Array.isArray(row)) Object.keys(row).forEach(function (key) { columns[key] = true; }); });
      var names = Object.keys(columns);
      if (!names.length) { box.innerHTML = '<div class="db-security-empty">' + before.length + ' record(s) selected. No field values supplied.</div>'; return; }
      box.innerHTML = '<div class="db-security-records">' +
        (before.length ? before : after).map(function (row, index) {
          var oldRow = before[index] || {}, newRow = Array.isArray(proposed) ? after[index] || {} : proposed || {};
          var deleting = proposed === null;
          var fields = names.slice(); Object.keys(newRow).forEach(function (key) { if (fields.indexOf(key) < 0) fields.push(key); });
          return '<section class="db-security-record"><h5>Record ' + (index + 1) + '</h5>' +
            (deleting ? '<p class="db-security-delete-note">Record will be deleted</p>' : '') +
            '<div class="db-security-change-head"><span>Field</span><span>Original values</span><span>' + (deleting ? 'After deletion' : 'Proposed values') + '</span></div>' + fields.map(function (key) {
              var next = Object.prototype.hasOwnProperty.call(newRow, key) ? newRow[key] : oldRow[key];
              return '<div class="db-security-change-row"><strong>' + esc(key) + '</strong><div>' + formatValue(masked(oldRow[key], key)) + '</div><div>' + (deleting ? '<span class="db-security-null">Removed</span>' : formatValue(masked(next, key))) + '</div></div>';
            }).join('') + '</section>';
        }).join('') + '</div>'; return;
    }
    var keys = {}; Object.keys(original || {}).forEach(function (key) { keys[key] = true; }); Object.keys(proposed || {}).forEach(function (key) { keys[key] = true; });
    var names = Object.keys(keys);
    if (!names.length) { box.innerHTML = '<div class="db-security-empty">No field values supplied.</div>'; return; }
    box.innerHTML = '<div class="db-security-change-grid"><div class="db-security-change-head"><span>Field</span><span>Original</span><span>Proposed</span></div>' + names.map(function (key) {
      var before = masked(original && original[key], key), after = masked(proposed && proposed[key], key); var changed = JSON.stringify(before) !== JSON.stringify(after);
      return '<div class="db-security-change-row ' + (changed ? 'changed' : '') + '"><strong>' + esc(key) + '</strong><div>' + formatValue(before) + '</div><div>' + formatValue(after) + '</div></div>';
    }).join('') + '</div>';
  }
  function renderSummary(details) {
    var body = details.body || {}, review = details.review || null;
    var table = body.table || (review && review.table) || 'Database record';
    var record = body.keyValue != null ? String(body.keyValue) : (Array.isArray(body.rows) ? body.rows.length + ' selected records' : 'New record');
    var operation = String(details.operation || 'database change').replace(/[._]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    if (id('dbSecurityOperation')) id('dbSecurityOperation').textContent = operation;
    if (id('dbSecurityTable')) id('dbSecurityTable').textContent = table;
    if (id('dbSecurityRecord')) id('dbSecurityRecord').textContent = record;
    if (id('dbSecurityReasonSummary')) id('dbSecurityReasonSummary').textContent = body.reason || 'Not provided';
    renderChanges(review);
  }
  function code() { return Array.prototype.map.call(document.querySelectorAll('#dbSecurityDigits input'), function (el) { return el.value; }).join(''); }
  function reset() {
    document.querySelectorAll('#dbSecurityDigits input').forEach(function (el) { el.value = ''; el.disabled = false; });
    setStep('Passcode', 'pending', 'Pending'); setStep('Passkey', 'pending', 'Waiting for passcode'); setStep('Ebask', 'pending', 'Pending');
    var file = id('dbSecurityFile'); if (file) { file.value = ''; file.disabled = false; }
    var pass = id('dbSecurityPassphrase'); if (pass) { pass.value = ''; pass.disabled = false; }
    var verify = id('dbSecurityVerify'); if (verify) { verify.disabled = false; verify.textContent = 'Verify security factors'; }
    pending.options = null; pending.passkeyResponse = null;
    var save = id('dbSecuritySave'); if (save) save.disabled = true;
    var status = id('dbSecurityStatus'); if (status) status.textContent = 'Verification has not started.';
    showError(''); updateProgress();
  }
  async function verify() {
    if (!pending) return;
    var passphrase = id('dbSecurityPassphrase') && id('dbSecurityPassphrase').value || '', fileInput = id('dbSecurityFile');
    if (!/^\d{6}$/.test(code())) return showError('Enter all six passcode digits.');
    if (!fileInput || !fileInput.files || !fileInput.files[0]) return showError('Select your registered .ebask file.');
    if (passphrase.length < 12) return showError('Enter the EBASK passphrase.');
    var verifyButton = id('dbSecurityVerify'); if (verifyButton) { verifyButton.disabled = true; verifyButton.textContent = 'Verifying…'; }
    var passkeyRun = id('dbSecurityPasskeyRun'); if (passkeyRun) passkeyRun.disabled = true;
    document.querySelectorAll('#dbSecurityDigits input,#dbSecurityFile,#dbSecurityPassphrase').forEach(function (el) { el.disabled = true; });
    if (id('dbSecurityStatus')) id('dbSecurityStatus').textContent = 'Verifying security factors…';
    var current = 'Passcode';
    try {
      var file = JSON.parse(await fileInput.files[0].text());
      setStep('Passcode', 'working', 'Checking…'); current = 'Passcode';
      var passcodeResult = await api('POST', '/security/verify', { operation: pending.operation, targetHash: pending.targetHash, passcode: code() }, { skipStepUp: true });
      setStep('Passcode', 'verified', 'Verified');
      var options = pending.options || (await api('POST', '/security/database/options', { operation: pending.operation, targetHash: pending.targetHash, keyId: file.keyId })).data;
      pending.options = options;
      var passkeyResponse = pending.passkeyResponse;
      if (!passkeyResponse) { setStep('Passkey', 'working', 'Waiting…'); current = 'Passkey'; passkeyResponse = await window.pfAuthenticatePasskey(options.passkeyOptions); pending.passkeyResponse = passkeyResponse; setStep('Passkey', 'verified', 'Verified'); }
      setStep('Ebask', 'working', 'Waiting…'); current = 'Ebask';
      var signature = await window.ebaskSignChallenge(options.ebask, file, passphrase); setStep('Ebask', 'verified', 'Verified');
       var result = await api('POST', '/security/database/complete', { operation: pending.operation, targetHash: pending.targetHash, passcodeGrant: passcodeResult.data.grant, reason: pending.reason || '', passkeyResponse: passkeyResponse, ebask: { challengeId: options.ebask.challengeId, operation: pending.operation, targetHash: pending.targetHash, signature: signature } });
     pending.grant = result.data.grant; pending.verified = true; if (verifyButton) { verifyButton.disabled = true; verifyButton.textContent = 'Security verified'; } if (id('dbSecurityStatus')) id('dbSecurityStatus').textContent = 'All three checks passed. Review the change and save.'; updateProgress();
    } catch (e) {
      showError(e && e.message ? e.message : 'Security verification failed. No change was saved.');
      var code_ = e && e.code || '';
      if (code_ === 'SUPER_SECURITY_INVALID_CODE') setStep('Passcode', 'failed', 'Failed');
      else if (code_.indexOf('WEBAUTHN') === 0) setStep('Passkey', 'failed', 'Failed');
      else if (code_.indexOf('EBASK') === 0) setStep('Ebask', 'failed', 'Failed');
      else ['Passcode', 'Passkey', 'Ebask'].forEach(function (name) { var el = id('dbSecurityStep' + name); if (el && el.dataset.state === 'working') setStep(name, 'failed', 'Failed'); });
      pending.options = null; pending.passkeyResponse = null;
      if (id('dbSecurityStatus')) id('dbSecurityStatus').textContent = 'Verification failed. No database change was saved.';
      document.querySelectorAll('#dbSecurityDigits input,#dbSecurityFile,#dbSecurityPassphrase').forEach(function (el) { el.disabled = false; }); if (verifyButton) { verifyButton.disabled = false; verifyButton.textContent = 'Try verification again'; }
      if (passkeyRun) passkeyRun.disabled = false;
    }
  }
  function init() {
    var modal = id('dbSecurityModal'); if (!modal) return;
    modal.addEventListener('keydown', function (event) { if (event.key === 'Escape' && pending) close(null, Object.assign(new Error('Security verification cancelled.'), { code: 'DATABASE_SECURITY_CANCELLED' })); });
    id('dbSecurityVerify').addEventListener('click', verify);
    var passkeyRun = id('dbSecurityPasskeyRun'); if (passkeyRun) passkeyRun.addEventListener('click', verify);
     id('dbSecuritySave').addEventListener('click', function () { if (pending && pending.verified) close({ grant: pending.grant, reason: pending.reason || '' }, null); });
    ['dbSecurityCancel', 'dbSecurityCancelFooter'].forEach(function (name) { var el = id(name); if (el) el.addEventListener('click', function () { if (pending) close(null, Object.assign(new Error('Security verification cancelled.'), { code: 'DATABASE_SECURITY_CANCELLED' })); }); });
    document.querySelectorAll('#dbSecurityDigits input').forEach(function (input, index, all) {
      input.addEventListener('keydown', function (event) { if (event.key === 'Backspace' && !input.value && all[index - 1]) all[index - 1].focus(); if (event.key === 'Enter') verify(); });
      input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(-1); if (input.value && all[index + 1]) all[index + 1].focus(); });
      input.addEventListener('paste', function (event) { var value = (event.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6); if (!value) return; event.preventDefault(); all.forEach(function (field, fieldIndex) { field.value = value[fieldIndex] || ''; }); all[Math.min(value.length, 6) - 1].focus(); });
    });
  }
   window.requestDatabaseSecurity = function (details) { if (pending) return Promise.reject(new Error('Another database security verification is already in progress.')); var modal = id('dbSecurityModal'); if (!modal) return Promise.reject(new Error('Database security modal is unavailable.')); return new Promise(function (resolve, reject) { pending = { resolve: resolve, reject: reject, operation: details.operation, targetHash: details.targetHash, reason: details.body && details.body.reason || '', verified: false, grant: null }; reset(); renderSummary(details); modal.classList.add('on'); modal.setAttribute('aria-hidden', 'false'); var first = document.querySelector('#dbSecurityDigits input'); if (first) first.focus(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
