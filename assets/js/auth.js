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
    var json = await res.json();
    if (!json.success) throw new Error(json.message);
    // Keep the returned token only in memory as a compatibility fallback.
    // The HttpOnly cookie remains the persistent session mechanism.
    authToken = json.data.token || null;
    resolveAdminAuthGate(true);
    localStorage.setItem('admin_user', JSON.stringify(json.data.admin));
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

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  if (typeof renderAdminIdentity === 'function') renderAdminIdentity();
  if (typeof applyNavPermissions === 'function') applyNavPermissions();
  loadAllData();
  if (typeof roStartAfterAuth === 'function') roStartAfterAuth();
  if (typeof loadSupportUnreadBadge === 'function') loadSupportUnreadBadge();
  if (typeof startModerationAlerts === 'function') startModerationAlerts();
}

// ═══════════════ INIT ═══════════════
async function restoreAdminSession() {
  resetAdminAuthGate();
  try {
    var res = await api('GET', '/profile', null, { skipAuthWait: true });
    resolveAdminAuthGate(true);
    if (res.data && res.data.profile) localStorage.setItem('admin_user', JSON.stringify(res.data.profile));
    showApp();
  } catch (_) {
    resolveAdminAuthGate(false);
    document.getElementById('loginScreen').style.display = 'flex';
  }
}
restoreAdminSession();
