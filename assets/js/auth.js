// ═══════════════ LOGIN / LOGOUT ═══════════════
async function doLogin() {
  var email = document.getElementById('login-email').value.trim();
  var pass = document.getElementById('login-pass').value;
  if (!email || !pass) { showLoginErr('Enter email and password'); return; }
  document.getElementById('loginBtn').disabled = true;
  document.getElementById('loginBtn').textContent = 'Signing in...';
  try {
    var res = await fetch(API_BASE + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: pass })
    });
    var json = await res.json();
    if (!json.success) throw new Error(json.message);
    authToken = json.data.token;
    localStorage.setItem('admin_token', authToken);
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
  if (authToken) {
    fetch(API_BASE + '/logout', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + authToken }
    }).catch(function(){});
  }
  authToken = null;
  localStorage.removeItem('admin_token');
  localStorage.removeItem('admin_user');
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
}

function showApp() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  loadAllData();
}

// ═══════════════ INIT ═══════════════
if (authToken) {
  showApp();
} else {
  document.getElementById('loginScreen').style.display = 'flex';
}
