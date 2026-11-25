(function () {
  'use strict';
  var state = null;
  function id(name) { return document.getElementById(name); }
  function digits() { return Array.prototype.map.call(document.querySelectorAll('#adminGateDigits input'), function (el) { return el.value; }).join(''); }
  function setState(name, text, status) { var el = id('adminGate' + name + 'State'); if (el) { el.textContent = text; el.dataset.status = status || ''; el.className = 'admin-factor-gate-state ' + (status || 'pending'); } updateProgress(); }
  function updateProgress() { var done = ['Passcode', 'Passkey', 'Ebask'].filter(function (name) { var el = id('adminGate' + name + 'State'); return el && el.dataset.status === 'verified'; }).length; var progress = id('adminFactorGateProgress'); if (progress) { progress.firstChild.textContent = done + ' of 3'; } var bar = id('adminFactorGateProgressBar'); if (bar) bar.style.width = ((done / 3) * 100) + '%'; var button = id('adminFactorGateVerify'); if (button) { button.disabled = !!(state && state.busy); button.textContent = state && state.busy ? 'Verifying…' : 'Verify security factors'; } }
  function error(message) { var el = id('adminFactorGateError'); if (el) el.textContent = message || ''; }
  function close() { var modal = id('adminFactorGateModal'); if (modal) { modal.classList.remove('on'); modal.setAttribute('aria-hidden', 'true'); } }
  function reset() { document.querySelectorAll('#adminGateDigits input').forEach(function (el) { el.value = ''; }); ['Passcode', 'Passkey', 'Ebask'].forEach(function (name) { setState(name, name === 'Passkey' ? 'Waiting for passcode' : 'Pending', ''); }); var file = id('adminGateFile'); if (file) file.value = ''; var fileName = id('adminGateFileName'); if (fileName) fileName.textContent = 'No file selected'; var pass = id('adminGatePassphrase'); if (pass) pass.value = ''; error(''); updateProgress(); }
  async function verify() {
    if (!state || state.busy) return;
    var passphrase = id('adminGatePassphrase').value, fileInput = id('adminGateFile');
    if (!/^\d{6}$/.test(digits())) return error('Enter all six passcode digits.');
    if (!fileInput.files || !fileInput.files[0]) return error('Select the registered .ebask file.');
    if (passphrase.length < 12) return error('Enter the EBASK passphrase.');
    state.busy = true; updateProgress();
    try {
      var file = JSON.parse(await fileInput.files[0].text());
      setState('Passcode', 'Checking…', 'working');
      var passcode = await api('POST', '/security/verify', { operation: 'admin.login.verify', targetHash: state.targetHash, passcode: digits() }, { skipStepUp: true });
      setState('Passcode', 'Verified', 'verified');
      setState('Passkey', 'Waiting…', 'working');
      var options = (await api('POST', '/security/login/options', {})).data;
      var passkeyResponse = await window.pfAuthenticatePasskey(options.passkeyOptions);
      setState('Passkey', 'Verified', 'verified');
      setState('Ebask', 'Checking…', 'working');
      var signature = await window.ebaskSignChallenge(options.ebask, file, passphrase);
      setState('Ebask', 'Verified', 'verified');
      await api('POST', '/security/login/complete', { operation: options.operation, targetHash: options.targetHash, passcodeGrant: passcode.data.grant, passkeyResponse: passkeyResponse, ebask: { challengeId: options.ebask.challengeId, operation: options.operation, targetHash: options.targetHash, signature: signature } }, { skipAuthWait: true });
      authToken = null;
      close();
      state.resolve(true); state = null;
    } catch (e) {
      state.busy = false; ['Passcode', 'Passkey', 'Ebask'].forEach(function (name) { var el = id('adminGate' + name + 'State'); if (el && el.dataset.status === 'working') setState(name, 'Failed', 'failed'); });
      error(e && e.message || 'Security verification failed.'); updateProgress();
    }
  }
  function init() {
    id('adminFactorGateVerify').addEventListener('click', verify);
    id('adminFactorGateLogout').addEventListener('click', function () { if (typeof doLogout === 'function') doLogout(); });
    document.querySelectorAll('#adminGateDigits input').forEach(function (input, index, all) { input.addEventListener('input', function () { input.value = input.value.replace(/\D/g, '').slice(-1); if (input.value && all[index + 1]) all[index + 1].focus(); }); input.addEventListener('keydown', function (event) { if (event.key === 'Backspace' && !input.value && all[index - 1]) all[index - 1].focus(); }); });
    var file = id('adminGateFile'); if (file) file.addEventListener('change', function () { var display = id('adminGateFileName'); if (display) display.textContent = file.files && file.files[0] ? file.files[0].name : 'No file selected'; });
  }
  window.requestAdminFactorGate = function (targetHash) { return new Promise(function (resolve, reject) { state = { targetHash: targetHash, resolve: resolve, reject: reject, busy: false }; reset(); var modal = id('adminFactorGateModal'); modal.classList.add('on'); modal.setAttribute('aria-hidden', 'false'); id('adminGateDigits').querySelector('input').focus(); }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
}());
