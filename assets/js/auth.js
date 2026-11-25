// ═══════════════ LOGIN / LOGOUT ═══════════════
async function doLogin() {
  var email = document.getElementById('login-email').value.trim();
  var pass = document.getElementById('login-pass').value;
  if (!email || !pass) { showLoginErr('Enter email and password'); return; }
  document.getElementById('loginBtn').disabled = true;
  document.getElementById('loginBtn').textContent = 'Signing in...';
  resetAdminAuthGate();
  try {
    var res = await fetch(API_BASE + '/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
      body: JSON.stringify({ email: email, password: pass })
    });
    var json = {};
    try { json = await res.json(); } catch (_) { throw new Error('The server returned an invalid login response.'); }
    if (!res.ok || !json || json.success !== true) throw new Error(json.message || 'Sign-in failed.');
    if (!json.data || !json.data.admin) throw new Error('The server returned an incomplete login response. Please try again.');
    // Keep the returned token only in memory as a compatibility fallback.
    // The HttpOnly cookie remains the persistent session mechanism.
    authToken = json.data.token || null;
    resetAdminClientState();
     resolveAdminAuthGate(true);
     localStorage.setItem('admin_user', JSON.stringify(json.data.admin));
      var gateStatus = await api('GET', '/security/login/status', null, { skipAuthWait: true });
      if (gateStatus.data && gateStatus.data.setupRequired) { showRestrictedEnrollmentApp(gateStatus.data); return; }
      var gateHash = gateStatus.data && gateStatus.data.targetHash || (json.data.session && json.data.session.factorTargetHash);
     if (!gateHash || typeof requestAdminFactorGate !== 'function') throw new Error('Administrator security verification is unavailable.');
     await requestAdminFactorGate(gateHash);
     showApp();
  } catch (e) {
    showLoginErr(e.message);
  } finally {
    document.getElementById('loginBtn').disabled = false;
    document.getElementById('loginBtn').textContent = 'Sign In';
  }
}

function showLoginErr(msg) {
  var el = document.getElementById('loginErr');
  el.textContent = msg;
  el.style.display = 'block';
}

function doLogout() {
  resetAdminClientState();
  if (typeof roStop === 'function') roStop();
  if (typeof daReset === 'function') daReset();
  if (typeof stopModerationAlerts === 'function') stopModerationAlerts();
  if (adminSessionReady || authToken) {
    fetch(API_BASE + '/logout', {
      method: 'POST',
      credentials: 'include',
      headers: authToken ? { 'Authorization': 'Bearer ' + authToken } : {}
    }).catch(function(){});
  }
  authToken = null;
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
  resolveAdminAuthGate(false);
  if (typeof closeMobileMenu === 'function') closeMobileMenu();
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function resetAdminClientState() {
  if (typeof resetAdminFactorGate === 'function') resetAdminFactorGate();
  if (typeof invalidateDataLoadSession === 'function') invalidateDataLoadSession();
  if (typeof cachedPlaces !== 'undefined') cachedPlaces = {};
  if (typeof cachedFoods !== 'undefined') cachedFoods = {};
  if (typeof cachedHotels !== 'undefined') cachedHotels = {};
  if (typeof cachedOrders !== 'undefined') cachedOrders = {};
  if (typeof cachedDrivers !== 'undefined') cachedDrivers = {};
  if (typeof cachedPlacesArr !== 'undefined') cachedPlacesArr = [];
  if (typeof orderBulkSelected !== 'undefined') orderBulkSelected = {};
  if (typeof roStop === 'function') roStop();
  if (typeof stopModerationAlerts === 'function') stopModerationAlerts();
}

async function refreshAdminSessionData() {
  var response = await api('GET', '/profile');
  var data = response.data || {};
  var profile = data.profile || {};
  var current = {};
  try { current = JSON.parse(localStorage.getItem('admin_user') || '{}') || {}; } catch (_) {}
  var fresh = Object.assign({}, current, profile);
  if (Array.isArray(data.permissions)) fresh.permissions = data.permissions;
  localStorage.setItem('admin_user', JSON.stringify(fresh));
  if (typeof renderAdminIdentity === 'function') renderAdminIdentity();
  if (typeof applyNavPermissions === 'function') applyNavPermissions();
  return fresh;
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  refreshAdminSessionData().then(function() {
    loadAllData();
    if (typeof pfLoadSecurity === 'function') pfLoadSecurity();
    if (typeof roStartAfterAuth === 'function') roStartAfterAuth();
    if (typeof loadSupportUnreadBadge === 'function') loadSupportUnreadBadge();
    if (typeof startModerationAlerts === 'function') startModerationAlerts();
  }).catch(function(error) {
    showLoginErr('Your session could not be initialized. Please sign in again.');
    doLogout();
    if (typeof console !== 'undefined') console.error('[AdminSession] Refresh failed:', error.message);
  });
}

function showRestrictedEnrollmentApp(status) {
  window.adminEnrollmentRestricted = true;
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  var banner = document.getElementById('adminEnrollmentBanner');
  if (!banner) { banner = document.createElement('div'); banner.id = 'adminEnrollmentBanner'; banner.className = 'admin-enrollment-banner'; var appHeader = document.querySelector('#app > header'); if (appHeader) appHeader.after(banner); else document.getElementById('app').prepend(banner); }
  var expiry = status && status.enrollmentExpiresAt ? new Date(status.enrollmentExpiresAt).getTime() : 0;
  banner.innerHTML = '<div><strong>Complete your security setup</strong><p>Your administrative account has restricted access. Complete all three security methods before the enrollment deadline.</p><small id="adminEnrollmentCountdown"></small></div><button type="button" class="btn btn-accent" id="adminEnrollmentSetupButton">Complete Security Setup</button>';
  var setupButton = document.getElementById('adminEnrollmentSetupButton'); if (setupButton) setupButton.onclick = function () { if (typeof switchTab === 'function') switchTab('profile'); var securityCard = document.getElementById('pf-security-card'); if (securityCard) securityCard.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  var update = function () { var remaining = Math.max(0, expiry - Date.now()); var el = document.getElementById('adminEnrollmentCountdown'); if (el) el.textContent = remaining ? 'Enrollment time remaining: ' + new Date(remaining).toISOString().slice(11, 19) : 'Enrollment period expired. Contact a Super Admin.'; };
  update(); window.clearInterval(window.adminEnrollmentTimer); window.adminEnrollmentTimer = window.setInterval(update, 1000);
  refreshAdminSessionData().then(function () { if (typeof pfLoadSecurity === 'function') pfLoadSecurity(); }).catch(function () {});
}

// ═══════════════ INIT ═══════════════
async function restoreAdminSession() {
  resetAdminAuthGate();
  try {
    resolveAdminAuthGate(true);
    var status = await api('GET', '/security/login/status', null, { skipAuthWait: true });
    if (status.data && status.data.setupRequired) { showRestrictedEnrollmentApp(status.data); return; }
    if (!status.data || !status.data.verified) {
      await requestAdminFactorGate(status.data && status.data.targetHash);
      authToken = null;
    }
    showApp();
  } catch (_) {
    resolveAdminAuthGate(false);
    document.getElementById('loginScreen').style.display = 'flex';
  }
}
restoreAdminSession();
