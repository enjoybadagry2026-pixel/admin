// ═══════════════ ADMIN STAFF ═══════════════

var stState = { loading: false, loaded: false };
var stAdmins = [];
var stRoles = [];
var stPermCategories = {};
var stEditId = null;
var stResetId = null;
var stDetailId = null;

function stShowState(state, message) {
  var loading = document.getElementById('staff-loading');
  var error = document.getElementById('staff-error');
  var wrap = document.getElementById('staff-table-wrap');
  if (loading) loading.style.display = state === 'loading' ? '' : 'none';
  if (error) {
    error.style.display = state === 'error' ? '' : 'none';
    if (state === 'error') {
      var t = document.getElementById('staff-error-text');
      if (t) t.textContent = message || 'Something went wrong';
    }
  }
  if (wrap) wrap.style.display = state === 'loading' || state === 'error' ? 'none' : '';
}

function loadStaffPanel(force) {
  if (stState.loading) return;
  if (!force && stState.loaded) return;
  stState.loading = true;
  stShowState('loading');

  Promise.all([api('GET', '/admins'), api('GET', '/admins/roles')])
    .then(function(results) {
      stAdmins = (results[0].data && results[0].data.admins) || [];
      stRoles = (results[1].data && results[1].data.roles) || [];
      stPermCategories = (results[1].data && results[1].data.permissionCategories) || {};
      stState.loaded = true;
      stShowState('ready');
      renderStaff();
    })
    .catch(function(e) {
      stShowState('error', e.message);
      toast('Error: ' + e.message, false);
    })
    .finally(function() {
      stState.loading = false;
    });
}

function stInitials(name) {
  if (!name) return '?';
  var parts = String(name).trim().split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

function stStatusBadge(a) {
  if (a.lockedUntil && new Date(a.lockedUntil).getTime() > Date.now()) {
    return '<span class="tag tag-cancelled">Locked</span>';
  }
  return a.active
    ? '<span class="tag tag-confirmed">Active</span>'
    : '<span class="tag tag-cancelled">Disabled</span>';
}

function renderStaff() {
  var body = document.getElementById('staff-list');
  if (!body) return;
  var html = '';

  stAdmins.forEach(function(a) {
    var actions = '<button class="btn btn-ghost btn-sm" onclick="staffOpenForm(' + a.id + ')">Edit</button> ' +
      '<button class="btn btn-ghost btn-sm" onclick="staffOpenDetail(' + a.id + ')">Details</button>';
    if (!a.isSelf) {
      actions += ' <button class="btn btn-ghost btn-sm" onclick="staffOpenReset(' + a.id + ')">Reset PW</button>';
    }

    html += '<tr' + (a.isSelf ? ' class="st-self"' : '') + '>' +
      '<td><div class="st-admin">' +
        '<span class="st-avatar">' + esc(stInitials(a.fullName || a.email)) + '</span>' +
        '<span class="st-admin-info">' +
          '<span class="st-name">' + esc(a.fullName || '—') + (a.isSelf ? ' <span class="st-you">you</span>' : '') + '</span>' +
          '<span class="st-email">' + esc(a.email) + '</span>' +
        '</span>' +
      '</div></td>' +
      '<td><span class="tag tag-pending">' + esc(a.roleLabel || a.role) + '</span></td>' +
      '<td>' + stStatusBadge(a) + '</td>' +
      '<td>' + (a.lastLogin ? esc(fmtDate(a.lastLogin)) : '<span class="au-muted">Never</span>') +
        (a.lastLoginIp ? '<div class="au-role">' + esc(a.lastLoginIp) + '</div>' : '') + '</td>' +
      '<td>' + (a.activeSessions ? a.activeSessions + ' live' : '—') + '</td>' +
      '<td>' + (a.createdAt ? esc(fmtDate(a.createdAt)) : '—') + '</td>' +
      '<td class="st-acts">' + actions + '</td>' +
    '</tr>';
  });

  if (!html) {
    html = '<tr><td colspan="7"><div class="user-empty">' +
      '<div class="user-empty-icon">\uD83D\uDC64</div>' +
      '<div class="user-empty-title">No admin accounts</div>' +
      '<div class="user-empty-text">Create the first staff account with the New Admin button.</div>' +
      '</div></td></tr>';
  }
  body.innerHTML = html;

  var count = document.getElementById('staff-count');
  if (count) count.textContent = stAdmins.length + ' account' + (stAdmins.length === 1 ? '' : 's');

  var hint = document.getElementById('staff-hint');
  if (hint) {
    var live = stAdmins.filter(function(a) { return a.active; }).length;
    hint.textContent = live + ' active · ' + (stAdmins.length - live) + ' deactivated · only Super Admins can change Super Admin accounts.';
  }

  var newBtn = document.querySelector('#panel-staff .order-page-actions .btn-accent');
  if (newBtn) newBtn.style.display = hasPerm('admins.manage') ? '' : 'none';
}

// ─── Create / edit form ─────────────────────────

function stFillRoleSelect(selected) {
  var sel = document.getElementById('stf-role');
  if (!sel) return;
  sel.innerHTML = stRoles.map(function(r) {
    return '<option value="' + esc(r.name) + '"' + (r.name === selected ? ' selected' : '') + '>' + esc(r.label || r.name) + '</option>';
  }).join('');
  stUpdateRoleHint();
}

function stUpdateRoleHint() {
  var sel = document.getElementById('stf-role');
  var hint = document.getElementById('stf-role-hint');
  if (!sel || !hint) return;
  var role = null;
  stRoles.forEach(function(r) { if (r.name === sel.value) role = r; });
  if (!role) { hint.textContent = ''; return; }
  var count = (role.permissions || []).length;
  hint.textContent = (role.description ? role.description + ' ' : '') +
    '(' + count + ' permission' + (count === 1 ? '' : 's') + ')';
}

function staffOpenForm(id) {
  var modal = document.getElementById('staffFormModal');
  if (!modal) return;
  stEditId = id || null;

  var err = document.getElementById('stf-err');
  if (err) err.textContent = '';
  var save = document.getElementById('stf-save');
  if (save) { save.disabled = false; save.textContent = 'Save'; }

  var target = null;
  stAdmins.forEach(function(a) { if (a.id === id) target = a; });

  document.getElementById('stf-title').textContent = target ? 'Edit Admin' : 'New Admin';
  document.getElementById('stf-name').value = target ? (target.fullName || '') : '';
  document.getElementById('stf-phone').value = target ? (target.phone || '') : '';
  document.getElementById('stf-email').value = target ? target.email : '';
  document.getElementById('stf-pass').value = '';
  document.getElementById('stf-email-fg').style.display = target ? 'none' : '';
  document.getElementById('stf-pass-fg').style.display = target ? 'none' : '';
  document.getElementById('stf-active-fg').style.display = target ? '' : 'none';
  document.getElementById('stf-active').checked = target ? target.active !== false : true;

  stFillRoleSelect(target ? target.role : (stRoles[0] && stRoles[0].name));
  var roleSel = document.getElementById('stf-role');
  if (roleSel) roleSel.disabled = !!(target && target.isSelf);

  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
  setTimeout(function() { var n = document.getElementById('stf-name'); if (n) n.focus(); }, 50);
}

function closeStaffForm() {
  var modal = document.getElementById('staffFormModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  stEditId = null;
}

function staffSaveForm() {
  var errEl = document.getElementById('stf-err');
  if (errEl) errEl.textContent = '';
  var wasEdit = !!stEditId;
  var name = document.getElementById('stf-name').value.trim();
  var email = document.getElementById('stf-email').value.trim();
  var phone = document.getElementById('stf-phone').value.trim();
  var role = document.getElementById('stf-role').value;
  var pass = document.getElementById('stf-pass').value;
  var active = document.getElementById('stf-active').checked;
  var save = document.getElementById('stf-save');

  function fail(msg) { if (errEl) errEl.textContent = msg; }

  if (!name) return fail('Full name is required.');
  if (!stEditId) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('A valid email is required.');
    if (pass.length < 8) return fail('Initial password must be at least 8 characters.');
  }
  if (!role) return fail('Choose a role.');

  var path, payload;
  if (stEditId) {
    path = '/admins/' + stEditId;
    payload = { fullName: name, phone: phone, role: role, active: active };
  } else {
    path = '/admins';
    payload = { fullName: name, email: email, phone: phone, role: role, password: pass };
  }

  save.disabled = true;
  save.textContent = 'Saving...';
  api(wasEdit ? 'PATCH' : 'POST', path, payload).then(function() {
    save.disabled = false;
    save.textContent = 'Save';
    closeStaffForm();
    toast(wasEdit ? 'Admin updated' : 'Admin account created');
    loadStaffPanel(true);
  }).catch(function(e) {
    save.disabled = false;
    save.textContent = 'Save';
    fail(e.message);
  });
}

// ─── Reset password ─────────────────────────

function staffOpenReset(id) {
  var target = null;
  stAdmins.forEach(function(a) { if (a.id === id) target = a; });
  if (!target) return;
  stResetId = id;

  var modal = document.getElementById('staffResetModal');
  var desc = document.getElementById('str-desc');
  var pass = document.getElementById('str-pass');
  var result = document.getElementById('str-result');
  var err = document.getElementById('str-err');
  var confirm = document.getElementById('str-confirm');

  if (desc) desc.textContent = 'Set a new password for ' + target.email + '. Every active session of that account is revoked immediately.';
  if (pass) pass.value = '';
  if (result) result.style.display = 'none';
  if (err) err.textContent = '';
  if (confirm) { confirm.disabled = false; confirm.textContent = 'Reset password'; }

  modal.classList.add('on');
  document.body.style.overflow = 'hidden';
}

function closeStaffReset() {
  var modal = document.getElementById('staffResetModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  stResetId = null;
}

function staffConfirmReset() {
  if (!stResetId) return;
  var pass = document.getElementById('str-pass').value.trim();
  var err = document.getElementById('str-err');
  var confirm = document.getElementById('str-confirm');
  if (err) err.textContent = '';
  if (pass && pass.length < 8) {
    if (err) err.textContent = 'Password must be at least 8 characters.';
    return;
  }

  confirm.disabled = true;
  confirm.textContent = 'Resetting...';
  api('POST', '/admins/' + stResetId + '/reset-password', pass ? { password: pass } : {})
    .then(function(res) {
      confirm.disabled = false;
      confirm.textContent = 'Done';
      var data = res.data || {};
      var result = document.getElementById('str-result');
      var label = document.querySelector('#str-result .ua-result-label');
      var value = document.getElementById('str-result-value');
      var note = document.getElementById('str-result-note');
      if (data.temporaryPassword) {
        if (label) label.textContent = 'Temporary password — shown once';
        value.textContent = data.temporaryPassword;
        if (note) note.textContent = (data.revokedSessions || 0) + ' session(s) revoked. Copy it now — it is never shown again.';
      } else {
        if (label) label.textContent = 'Password updated';
        value.textContent = '';
        if (note) note.textContent = (data.revokedSessions || 0) + ' session(s) revoked. The admin signs in with the password you set.';
      }
      result.style.display = '';
      toast('Password reset');
      loadStaffPanel(true);
    })
    .catch(function(e) {
      confirm.disabled = false;
      confirm.textContent = 'Reset password';
      if (err) err.textContent = e.message;
    });
}

// ─── Details: sessions + activity ─────────────────────────

function stSessionRows(sessions, adminId) {
  if (!sessions.length) {
    return '<p class="pf-note">No live sessions — this account is signed out everywhere.</p>';
  }
  var html = '<div class="um-rows">';
  sessions.forEach(function(s) {
    html += '<div class="um-row">' +
      '<div class="um-row-main">' +
        '<div class="um-row-title">' + esc(s.ip || 'Unknown device') + '</div>' +
        '<div class="um-row-sub">' + esc((s.userAgent || '').slice(0, 90) || 'No user agent') + '</div>' +
      '</div>' +
      '<div class="um-row-side">' +
        '<div class="um-row-meta">seen ' + esc(fmtDate(s.lastSeenAt)) + '</div>' +
        '<div class="um-row-meta">expires ' + esc(fmtDate(s.expiresAt)) + '</div>' +
        '<button class="btn btn-ghost btn-sm" onclick="stRevokeSession(' + adminId + ',' + s.id + ')">Revoke</button>' +
      '</div>' +
    '</div>';
  });
  return html + '</div>';
}

function stActivityRows(activity) {
  if (!activity.length) {
    return '<p class="pf-note">No recorded activity yet.</p>';
  }
  var html = '<div class="um-rows">';
  activity.forEach(function(a) {
    html += '<div class="um-row">' +
      '<div class="um-row-main">' +
        '<div class="um-row-title">' + esc(a.summary || a.action) + '</div>' +
        '<div class="um-row-sub"><code class="au-action">' + esc(a.action) + '</code>' +
          (a.targetType ? ' · ' + esc(a.targetType) + (a.targetId ? ' #' + esc(String(a.targetId).slice(0, 20)) : '') : '') + '</div>' +
      '</div>' +
      '<div class="um-row-side">' +
        '<div class="um-row-meta">' + esc(fmtDate(a.created_at || a.createdAt)) + '</div>' +
      '</div>' +
    '</div>';
  });
  return html + '</div>';
}

function staffOpenDetail(id) {
  var target = null;
  stAdmins.forEach(function(a) { if (a.id === id) target = a; });
  if (!target) return;
  stDetailId = id;

  var modal = document.getElementById('staffDetailModal');
  var body = document.getElementById('std-body');
  document.getElementById('std-title').textContent = target.fullName || target.email;
  document.getElementById('std-ref').textContent = (target.roleLabel || target.role) + ' · ' + target.email;
  body.innerHTML = '<div class="drv-loading"><div class="drv-loading-spinner"></div><div class="drv-loading-text">Loading account details...</div></div>';
  modal.classList.add('on');
  document.body.style.overflow = 'hidden';

  Promise.all([
    api('GET', '/admins/' + id + '/sessions'),
    api('GET', '/admins/' + id + '/activity?limit=30')
  ]).then(function(results) {
    if (stDetailId !== id) return;
    var sessions = (results[0].data && results[0].data.sessions) || [];
    var activity = (results[1].data && results[1].data.activity) || [];
    body.innerHTML =
      '<div class="std-head">' +
        '<div class="um-stats">' +
          '<div class="um-stat-card"><div class="um-stat-body"><div class="um-stat-value">' + sessions.length + '</div><div class="um-stat-label">Live sessions</div></div></div>' +
          '<div class="um-stat-card"><div class="um-stat-body"><div class="um-stat-value">' + activity.length + '</div><div class="um-stat-label">Recent actions</div></div></div>' +
          '<div class="um-stat-card"><div class="um-stat-body"><div class="um-stat-value">' + (target.failedLoginCount || 0) + '</div><div class="um-stat-label">Failed logins</div></div></div>' +
        '</div>' +
      '</div>' +
      '<div class="ntf-card-title std-section">Active sessions</div>' + stSessionRows(sessions, id) +
      '<div class="ntf-card-title std-section">Recent activity</div>' + stActivityRows(activity);
  }).catch(function(e) {
    if (stDetailId !== id) return;
    body.innerHTML = '<div class="drv-error">' +
      '<div class="drv-error-icon">⚠️</div>' +
      '<div class="drv-error-title">Failed to load account details</div>' +
      '<div class="drv-error-text">' + esc(e.message) + '</div>' +
      '<button class="btn btn-accent btn-sm" onclick="staffOpenDetail(' + id + ')">Retry</button>' +
    '</div>';
  });
}

function closeStaffDetail() {
  var modal = document.getElementById('staffDetailModal');
  if (modal) modal.classList.remove('on');
  if (!document.querySelector('.modal-bg.on')) document.body.style.overflow = '';
  stDetailId = null;
}

function stRevokeSession(adminId, sessionId) {
  api('DELETE', '/admins/' + adminId + '/sessions/' + sessionId).then(function() {
    toast('Session revoked');
    staffOpenDetail(adminId);
    loadStaffPanel(true);
  }).catch(function(e) {
    toast(e.message, false);
  });
}
