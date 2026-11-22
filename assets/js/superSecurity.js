// ═══════════════ SUPER SECURITY STEP-UP ═══════════════
(function () {
  'use strict';

  var modal;
  var inputs;
  var pending = null;
  var request = null;

  function byId(id) { return document.getElementById(id); }
  function messageFor(operation) {
    return String(operation || 'protected operation').replace(/[._]/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
  }
  function code() { return Array.prototype.map.call(inputs || [], function (input) { return input.value; }).join(''); }
  function clear() { Array.prototype.forEach.call(inputs || [], function (input) { input.value = ''; input.disabled = false; }); }
  function setBusy(busy) {
    Array.prototype.forEach.call(inputs || [], function (input) { input.disabled = busy; });
    var verify = byId('superSecurityVerify'); var cancel = byId('superSecurityCancel');
    if (verify) { verify.disabled = busy; verify.textContent = busy ? 'Verifying…' : 'Verify'; }
    if (cancel) cancel.disabled = busy;
  }
  function close(result, error) {
    if (!modal) return;
    modal.classList.remove('on');
    modal.setAttribute('aria-hidden', 'true');
    var current = pending; pending = null; request = null;
    clear(); setBusy(false);
    if (current) error ? current.reject(error) : current.resolve(result);
  }
  function cancel() {
    var error = new Error('Security verification cancelled.'); error.code = 'SUPER_SECURITY_CANCELLED';
    close(null, error);
  }
  function showError(error) {
    var target = byId('superSecurityError');
    if (!target) return;
    target.textContent = error && error.message ? error.message : 'Verification failed. Try again.';
  }
  async function verify() {
    if (!request || !pending) return;
    var value = code();
    if (!/^\d{6}$/.test(value)) { showError(new Error('Enter all six numeric digits.')); return; }
    setBusy(true); showError(null);
    try {
      var response = await api('POST', '/security/verify', { operation: request.operation, targetHash: request.targetHash, passcode: value }, { skipStepUp: true });
      close(response.data && response.data.grant, null);
    } catch (error) {
      clear(); setBusy(false); showError(error);
      if (error.code === 'SUPER_SECURITY_LOCKED') {
        var verifyButton = byId('superSecurityVerify'); if (verifyButton) verifyButton.disabled = true;
      }
      if (inputs && inputs[0]) inputs[0].focus();
    }
  }
  function init() {
    modal = byId('superSecurityModal');
    if (!modal) return;
    inputs = modal.querySelectorAll('.super-security-digits input');
    Array.prototype.forEach.call(inputs, function (input, index) {
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Backspace' && !input.value && index > 0) inputs[index - 1].focus();
        if (event.key === 'Enter') { event.preventDefault(); verify(); }
      });
      input.addEventListener('input', function () {
        input.value = input.value.replace(/\D/g, '').slice(-1);
        if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
      });
      input.addEventListener('paste', function (event) {
        var pasted = (event.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').slice(0, 6);
        if (!pasted) return;
        event.preventDefault();
        Array.prototype.forEach.call(inputs, function (field, fieldIndex) { field.value = pasted[fieldIndex] || ''; });
        inputs[Math.min(pasted.length, 6) - 1].focus();
      });
    });
    byId('superSecurityVerify').addEventListener('click', verify);
    byId('superSecurityCancel').addEventListener('click', cancel);
  }

  window.requestSuperSecurity = function (details) {
    if (pending) {
      var busyError = new Error('Another security verification is already in progress.'); busyError.code = 'SUPER_SECURITY_BUSY';
      return Promise.reject(busyError);
    }
    return new Promise(function (resolve, reject) {
      pending = { resolve: resolve, reject: reject };
      request = { operation: details.operation, targetHash: details.targetHash };
      byId('superSecurityAction').textContent = 'Action: ' + messageFor(request.operation);
      byId('superSecurityError').textContent = '';
      clear(); setBusy(false);
      modal.classList.add('on'); modal.setAttribute('aria-hidden', 'false');
      if (inputs && inputs[0]) inputs[0].focus();
    });
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
}());
