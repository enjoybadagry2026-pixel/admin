(function () {
  'use strict';
  var form = document.getElementById('driver-form');
  var status = document.getElementById('driver-status');
  var button = form.querySelector('button[type="submit"]');
  var key = null;
  var submitting = false;
  var fields = ['fullName', 'email', 'phone', 'alternativePhone', 'address', 'city', 'licenceStatus', 'experience', 'vehicleOwnership', 'vehicleType', 'vehicleMakeModel', 'vehicleRegistration', 'operatingArea', 'availability', 'professionalExperience', 'qualifications', 'additionalInfo'];

  function uuid() {
    if (!window.crypto) throw new Error('Secure randomness unavailable');
    if (window.crypto.randomUUID) return window.crypto.randomUUID();
    if (!window.crypto.getRandomValues) throw new Error('Secure randomness unavailable');
    var bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var hex = Array.prototype.map.call(bytes, function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20);
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    if (submitting) return;
    fields.forEach(function (name) {
      var field = form.elements[name];
      field.value = field.value.trim();
    });
    if (!form.reportValidity()) return;
    try {
      if (!key) key = uuid();
    } catch (error) {
      status.textContent = 'Your browser cannot securely prepare this application. Please use a current browser or contact support.';
      return;
    }
    var payload = {};
    fields.forEach(function (name) { payload[name] = form.elements[name].value; });
    payload.consent = form.elements.consent.checked;
    payload.idempotencyKey = key;
    submitting = true;
    button.disabled = true;
    button.textContent = 'Submitting…';
    status.textContent = 'Submitting your application…';
    try {
      var response = await fetch('https://api.enjoybadagry.online/api/driver-applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      var result;
      try { result = await response.json(); } catch (error) { result = null; }
      if (response.status === 422) {
        status.textContent = 'Please check your details, including phone numbers and email, and try again.';
        return;
      }
      if (response.status === 409) {
        status.textContent = 'This application reference was already used with different details. Please contact support before submitting again to avoid a duplicate.';
        return;
      }
      if (response.status === 429) {
        status.textContent = 'Too many attempts. Please wait before trying again; your details are still here.';
        return;
      }
      if (!response.ok || !result || result.success !== true || !result.data || typeof result.data.applicationId !== 'string' || !result.data.applicationId.trim()) {
        throw new Error('Unconfirmed response');
      }
      status.textContent = 'Application submitted. Your application ID is ' + result.data.applicationId + '. Applications are reviewed; approved applicants will be contacted.';
      form.reset();
      key = null;
    } catch (error) {
      status.textContent = 'We could not confirm your application. Your details are still here; please check your connection and try again, or contact support. If the problem persists, the service may be unavailable.';
    } finally {
      submitting = false;
      button.disabled = false;
      button.textContent = 'Submit application';
    }
  });
}());
